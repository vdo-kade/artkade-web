"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient as createAuthClient } from "@/lib/supabase-server";
import { getSessionRole } from "@/lib/session-role";
import { CATEGORY_ORDER } from "@/lib/catalogue";
import { defaultWeightGrams } from "@/lib/shipping";
import { uniqueProductSlug } from "@/lib/slug";
import { FREEBIE_CATEGORY_ORDER } from "@/lib/freebies";
import { uploadStallPhotoFile, uploadValidatedFreebieFile, type PhotoField } from "@/lib/storage";
import { validateUpload, type UploadValidationResult } from "@/lib/image-validation";
import { runPopupLifecycleTick } from "@/lib/popup-expiry";
import type { ActionState } from "@/lib/action-state";

// Every action here re-derives the caller's role/artist from their session
// (never trusts a client-submitted artistId) and scopes the write to that
// artist for vendors -- admin writes are unscoped. Mirrors the ownership
// pattern already used by app/admin/orders/actions.ts (service-role client
// + explicit filters, no RLS).

export async function updateStallDetails(formData: FormData): Promise<ActionState> {
  // A falsy session here means the Supabase auth session has actually
  // died server-side (expired refresh token, rotation reuse, etc.) --
  // silently no-opping left the form looking "unresponsive" with zero
  // feedback. Bouncing to login surfaces it and lets a fresh sign-in
  // restore a working session immediately.
  const session = await getSessionRole();
  if (!session) redirect("/admin/login");

  const artistId = formData.get("artistId");
  const name = formData.get("name");
  const tagline = formData.get("tagline");
  const bio = formData.get("bio");
  const isPopup = formData.get("isPopup") === "on";
  const popupStartsAtRaw = formData.get("popupStartsAt");
  const popupEndsAtRaw = formData.get("popupEndsAt");
  if (typeof artistId !== "string" || typeof name !== "string") {
    return { ok: false, error: "Missing required fields." };
  }
  if (session.role === "vendor" && artistId !== session.artistId) {
    return { ok: false, error: "You don't have permission to edit this stall." };
  }

  // <input type="datetime-local"> submits a local-time string with no
  // timezone (e.g. "2026-08-01T14:30"); the Date constructor parses that
  // as local time, which is the correct interpretation here.
  const popupStartsAt =
    typeof popupStartsAtRaw === "string" && popupStartsAtRaw
      ? new Date(popupStartsAtRaw).toISOString()
      : null;
  const popupEndsAt =
    typeof popupEndsAtRaw === "string" && popupEndsAtRaw
      ? new Date(popupEndsAtRaw).toISOString()
      : null;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("artists")
    .update({
      name,
      tagline: typeof tagline === "string" ? tagline : null,
      bio: typeof bio === "string" ? bio : null,
      is_popup: isPopup,
      popup_starts_at: popupStartsAt,
      popup_ends_at: popupEndsAt,
    })
    .eq("id", artistId);
  if (error) {
    console.error("Failed to update stall details:", error);
    return { ok: false, error: "Something went wrong. Check server logs." };
  }

  // Applies any consequence of the new dates immediately (e.g. an end date
  // just pushed into the past archives right away) rather than waiting for
  // the next cron tick or dashboard visit. Safe to always run: it only ever
  // activates a currently-inactive scheduled stall whose start has arrived,
  // or archives a currently-active one whose end has passed -- it never
  // deactivates a live stall just because its start date moved.
  await runPopupLifecycleTick(supabase);

  revalidatePath("/vendor");
  revalidatePath("/");
  return { ok: true };
}

const PHOTO_FIELDS = ["logo_url", "hero_image_url"] as const;

export async function uploadStallPhoto(formData: FormData): Promise<ActionState> {
  // A falsy session here means the Supabase auth session has actually
  // died server-side (expired refresh token, rotation reuse, etc.) --
  // silently no-opping left the form looking "unresponsive" with zero
  // feedback. Bouncing to login surfaces it and lets a fresh sign-in
  // restore a working session immediately.
  const session = await getSessionRole();
  if (!session) redirect("/admin/login");

  const artistId = formData.get("artistId");
  const field = formData.get("field");
  const file = formData.get("file");
  if (typeof artistId !== "string" || typeof field !== "string") {
    return { ok: false, error: "Missing required fields." };
  }
  if (!PHOTO_FIELDS.includes(field as PhotoField)) {
    return { ok: false, error: "Invalid photo field." };
  }
  if (session.role === "vendor" && artistId !== session.artistId) {
    return { ok: false, error: "You don't have permission to edit this stall." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a photo to upload." };
  }

  const supabase = createAdminClient();
  const { data: artist } = await supabase
    .from("artists")
    .select("slug")
    .eq("id", artistId)
    .maybeSingle();
  if (!artist) return { ok: false, error: "Stall not found." };

  const uploaded = await uploadStallPhotoFile(supabase, artist.slug, field as PhotoField, file);
  if (!uploaded.ok) return { ok: false, error: uploaded.error };

  const { error } = await supabase
    .from("artists")
    .update({ [field as PhotoField]: uploaded.url })
    .eq("id", artistId);
  if (error) {
    console.error("Failed to save uploaded photo URL:", error);
    return { ok: false, error: "Something went wrong. Check server logs." };
  }

  revalidatePath("/vendor");
  return { ok: true };
}

// A product needs at least one buyable variant; this caps how many variant
// rows the add/edit product forms render (plenty for sticker pack sizes,
// print sizes, and tee sizes -- see supabase/schema.sql).
const MAX_VARIANT_ROWS = 4;

// Same real magic-byte + size-cap validation as payment proof (see
// lib/image-validation.ts) rather than trusting file.type -- product photos
// are meant to always be real images.
async function uploadProductPhoto(
  supabase: ReturnType<typeof createAdminClient>,
  artistSlug: string,
  file: File
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const validated = await validateUpload(file, "image");
  if (!validated.ok) return validated;

  // Random suffix alongside the timestamp -- addProductImages can upload
  // several files in the same request, fast enough to land on the same
  // millisecond and collide on a Date.now()-only path.
  const path = `products/${artistSlug}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${validated.ext}`;

  const { error: uploadError } = await supabase.storage
    .from("media")
    .upload(path, validated.bytes, { contentType: validated.mime });
  if (uploadError) {
    console.error("Product photo upload failed:", uploadError);
    return { ok: false, error: "Upload failed. Check server logs." };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("media").getPublicUrl(path);
  return { ok: true, url: publicUrl };
}

export async function createProduct(formData: FormData): Promise<ActionState> {
  // A falsy session here means the Supabase auth session has actually
  // died server-side (expired refresh token, rotation reuse, etc.) --
  // silently no-opping left the form looking "unresponsive" with zero
  // feedback. Bouncing to login surfaces it and lets a fresh sign-in
  // restore a working session immediately.
  const session = await getSessionRole();
  if (!session) redirect("/admin/login");

  const artistId = formData.get("artistId");
  const name = formData.get("name");
  const description = formData.get("description");
  const category = formData.get("category");
  const file = formData.get("photo");
  const isOneOff = formData.get("isOneOff") === "on";
  if (typeof artistId !== "string" || typeof name !== "string" || !name.trim()) {
    return { ok: false, error: "Name is required." };
  }
  if (typeof category !== "string" || !CATEGORY_ORDER.includes(category)) {
    return { ok: false, error: "Choose a valid category." };
  }
  if (session.role === "vendor" && artistId !== session.artistId) {
    return { ok: false, error: "You don't have permission to add products to this stall." };
  }

  const variants: { label: string; price: number; stock: number }[] = [];
  for (let i = 0; i < MAX_VARIANT_ROWS; i++) {
    const label = formData.get(`variantLabel-${i}`);
    const price = Number(formData.get(`variantPrice-${i}`));
    const stock = Number(formData.get(`variantStock-${i}`));
    if (typeof label !== "string" || !label.trim()) continue;
    if (!Number.isFinite(price) || price < 0) continue;
    const rawStock = Number.isFinite(stock) && stock > 0 ? Math.floor(stock) : 0;
    variants.push({
      label: label.trim(),
      price,
      // A one-of-one item can never have more than 1 unit -- clamped here
      // server-side (the authoritative check) rather than trusting a max
      // attribute on the client input, which a submitted form can't bypass.
      stock: isOneOff ? Math.min(rawStock, 1) : rawStock,
    });
  }
  if (variants.length === 0) return { ok: false, error: "Add at least one valid variant." };

  // Shared-pool products need every variant to start at the same stock
  // number (see lib/stock.ts) -- there's no separate "pool size" field on
  // this form, so the first row's stock doubles as the whole pool's size
  // and gets applied to every size instead of letting them start uneven.
  if (category === "tshirt") {
    const poolStock = variants[0].stock;
    for (const v of variants) v.stock = poolStock;
  }

  const supabase = createAdminClient();
  const { data: artist } = await supabase
    .from("artists")
    .select("slug")
    .eq("id", artistId)
    .maybeSingle();
  if (!artist) return { ok: false, error: "Stall not found." };

  // MAX(sort_order)+1, not COUNT(*) -- count isn't stable once a product's
  // ever been deleted (it drops, so the next create can land back on a
  // sort_order an existing product already has), which is exactly what
  // produced real collisions in production (two products tied at the same
  // sort_order within a stall). Max keeps climbing regardless of deletions.
  const { data: maxSortRow } = await supabase
    .from("products")
    .select("sort_order")
    .eq("artist_id", artistId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSortOrder = (maxSortRow?.sort_order ?? -1) + 1;

  let imageUrl: string | null = null;
  if (file instanceof File && file.size > 0) {
    const uploaded = await uploadProductPhoto(supabase, artist.slug, file);
    if (!uploaded.ok) return { ok: false, error: uploaded.error };
    imageUrl = uploaded.url;
  }

  const slug = await uniqueProductSlug(supabase, name.trim());

  const { data: product, error } = await supabase
    .from("products")
    .insert({
      artist_id: artistId,
      name: name.trim(),
      slug,
      description: typeof description === "string" && description.trim() ? description.trim() : null,
      category,
      image_url: imageUrl,
      is_one_off: isOneOff,
      // T-shirts share one stock pool across every size instead of each
      // running independently -- see lib/stock.ts. Derived from category
      // rather than a vendor-facing toggle since it's a structural rule
      // for the category, not a per-product editorial choice.
      shared_stock_pool: category === "tshirt",
      sort_order: nextSortOrder,
    })
    .select("id")
    .single();
  if (error || !product) {
    console.error("Failed to create product:", error);
    return { ok: false, error: "Something went wrong. Check server logs." };
  }

  await supabase.from("product_variants").insert(
    variants.map((v) => ({
      product_id: product.id,
      label: v.label,
      price: v.price,
      stock: v.stock,
      weight_grams: defaultWeightGrams(category, v.label),
    }))
  );

  // Keeps the invariant the gallery manager (ProductImageManager) relies on
  // -- products.image_url always mirrors product_images' first row. Only
  // fires when a photo was actually uploaded above; an imageless product
  // just starts with an empty gallery instead.
  if (imageUrl) {
    await supabase.from("product_images").insert({ product_id: product.id, url: imageUrl, sort_order: 0 });
  }

  revalidatePath("/");
  // A redirect (rather than just revalidatePath) is what actually clears the
  // "Add a product" form -- it's a plain uncontrolled form with no client JS,
  // so a same-page re-render leaves the browser's typed-in values sitting in
  // the DOM. The redirect also carries `created` so the page can scroll to
  // and confirm the new product (see NewProductToast). ?artist= is preserved
  // so admin doesn't lose which stall they were managing; harmless no-op for
  // a vendor session, which ignores it.
  redirect(`/vendor?artist=${artist.slug}&created=${product.id}`);
}

// Bounds how many sizes/variants the edit form's "Add variant" can grow an
// existing product to (separate from MAX_VARIANT_ROWS above, which only
// bounds the fixed creation-time grid) -- generous enough for real growth
// over a product's life (more print sizes, more colourways) while still
// keeping this a bounded input rather than an unbounded one.
const MAX_PRODUCT_VARIANTS = 10;

// Nullable per-variant edition size: an empty/blank field means "not a
// limited run" (null), same convention as the sizing-chart/stock fields
// around it -- never trust the raw string as a number without this check,
// Number("") is 0, not "unset".
function parseEditionSize(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

export async function updateProduct(formData: FormData): Promise<ActionState> {
  // A falsy session here means the Supabase auth session has actually
  // died server-side (expired refresh token, rotation reuse, etc.) --
  // silently no-opping left the form looking "unresponsive" with zero
  // feedback. Bouncing to login surfaces it and lets a fresh sign-in
  // restore a working session immediately.
  const session = await getSessionRole();
  if (!session) redirect("/admin/login");

  const productId = formData.get("productId");
  const name = formData.get("name");
  const description = formData.get("description");
  const category = formData.get("category");
  const isActive = formData.get("isActive") === "on";
  const isOneOff = formData.get("isOneOff") === "on";
  const isExclusiveDrop = formData.get("isExclusiveDrop") === "on";
  const isBestseller = formData.get("isBestseller") === "on";
  const dropEndsAtRaw = formData.get("dropEndsAt");
  const sizingChartFile = formData.get("sizingChartPhoto");
  const removeSizingChart = formData.get("removeSizingChart") === "on";
  if (typeof productId !== "string") return { ok: false, error: "Missing product." };
  if (typeof name !== "string" || !name.trim()) return { ok: false, error: "Name is required." };
  if (typeof category !== "string" || !CATEGORY_ORDER.includes(category)) {
    return { ok: false, error: "Choose a valid category." };
  }

  const supabase = createAdminClient();

  // Ownership is re-derived from the product's own artist_id, exactly like
  // the stock/active update this replaces -- never trust a submitted
  // artistId for a vendor.
  let ownerQuery = supabase
    .from("products")
    .select("id, shared_stock_pool, artists(slug)")
    .eq("id", productId);
  if (session.role === "vendor") {
    ownerQuery = ownerQuery.eq("artist_id", session.artistId);
  }
  const { data: existing } = await ownerQuery.maybeSingle<{
    id: string;
    shared_stock_pool: boolean;
    artists: { slug: string } | null;
  }>();
  if (!existing || !existing.artists) return { ok: false, error: "Product not found." };

  // Per-product sizing chart override (tshirt-only in the UI, but not
  // enforced here -- a new upload always wins over the "remove" checkbox,
  // and the checkbox only matters when nothing new was uploaded.
  let sizingChartUrl: string | null | undefined;
  if (sizingChartFile instanceof File && sizingChartFile.size > 0) {
    const uploaded = await uploadProductPhoto(supabase, existing.artists.slug, sizingChartFile);
    if (!uploaded.ok) return { ok: false, error: uploaded.error };
    sizingChartUrl = uploaded.url;
  } else if (removeSizingChart) {
    sizingChartUrl = null;
  }

  // <input type="datetime-local"> submits a local-time string with no
  // timezone (e.g. "2026-08-01T14:30"); the Date constructor parses that as
  // local time, same reasoning as updateStallDetails' popup dates above.
  // Leaving the field blank is the only "clear it" affordance, same as that
  // same popup form -- no separate checkbox needed.
  const dropEndsAt =
    typeof dropEndsAtRaw === "string" && dropEndsAtRaw ? new Date(dropEndsAtRaw).toISOString() : null;

  const { error } = await supabase
    .from("products")
    .update({
      name: name.trim(),
      description: typeof description === "string" && description.trim() ? description.trim() : null,
      category,
      is_active: isActive,
      is_one_off: isOneOff,
      is_exclusive_drop: isExclusiveDrop,
      is_bestseller: isBestseller,
      drop_ends_at: dropEndsAt,
      ...(sizingChartUrl !== undefined ? { sizing_chart_url: sizingChartUrl } : {}),
    })
    .eq("id", productId);
  if (error) {
    console.error("Failed to update product:", error);
    return { ok: false, error: "Something went wrong. Check server logs." };
  }

  // Shared-pool products (see lib/stock.ts) submit one combined stock field
  // instead of a variantStock-<id> per row -- applying it to every sibling
  // here keeps them numerically identical, the invariant decrementStock/
  // restoreStock rely on to move the whole pool together. Same idea for
  // edition_size: a shared pool has one countdown, not five independent
  // ones, so it gets one combined field too (sharedEditionSize).
  const sharedStockValue = existing.shared_stock_pool
    ? Math.max(0, Math.floor(Number(formData.get("sharedStock")) || 0))
    : null;
  const sharedEditionSize = existing.shared_stock_pool
    ? parseEditionSize(formData.get("sharedEditionSize"))
    : null;

  // variantId rows the client already knows about (see ProductVariantManager)
  // are either real DB rows to update, or client-only "new-*" placeholders
  // for a size added via "Add variant" this same submit -- distinguished by
  // checking against what's actually in the DB right now, not by trusting
  // the id's shape.
  const { data: currentVariants } = await supabase
    .from("product_variants")
    .select("id")
    .eq("product_id", productId);
  const currentIds = new Set((currentVariants ?? []).map((v) => v.id));

  const submittedIds = formData.getAll("variantId") as string[];
  const updateIds = submittedIds.filter((id) => currentIds.has(id));
  const newIds = submittedIds.filter((id) => !currentIds.has(id));

  if (currentIds.size + newIds.length > MAX_PRODUCT_VARIANTS) {
    return { ok: false, error: `A product can have at most ${MAX_PRODUCT_VARIANTS} sizes.` };
  }

  const variantResults = await Promise.all(
    updateIds.map((variantId) => {
      const label = formData.get(`variantLabel-${variantId}`);
      const stock = sharedStockValue ?? Number(formData.get(`variantStock-${variantId}`));
      const price = Number(formData.get(`variantPrice-${variantId}`));
      const editionSize = existing.shared_stock_pool
        ? sharedEditionSize
        : parseEditionSize(formData.get(`variantEditionSize-${variantId}`));
      if (typeof label !== "string" || !label.trim()) return null;
      if (!Number.isFinite(price) || price < 0) return null;
      if (!Number.isFinite(stock) || stock < 0) return null;
      // Same server-side hard cap as createProduct -- a one-of-one item
      // can never end up with more than 1 unit in stock, regardless of
      // what was submitted.
      const clampedStock = isOneOff ? Math.min(Math.floor(stock), 1) : Math.floor(stock);
      return supabase
        .from("product_variants")
        .update({
          label: label.trim(),
          price,
          stock: clampedStock,
          edition_size: editionSize,
          // Recomputed on every edit, not just at creation -- if the label
          // changes (e.g. relabelled from A5 to A4), weight should follow
          // it rather than go stale. There's no manual weight override UI,
          // so this is always safe to recompute.
          weight_grams: defaultWeightGrams(category, label.trim()),
        })
        .eq("id", variantId)
        .eq("product_id", productId);
    })
  );
  const variantError = variantResults.find((r) => r?.error)?.error;
  if (variantError) console.error("Failed to update a product variant:", variantError);

  // Newly added rows (this same submit's "Add variant" clicks) -- inserted
  // fresh rather than updated, same field rules as above.
  const newRows = newIds
    .map((tempId) => {
      const label = formData.get(`variantLabel-${tempId}`);
      const stock = sharedStockValue ?? Number(formData.get(`variantStock-${tempId}`));
      const price = Number(formData.get(`variantPrice-${tempId}`));
      const editionSize = existing.shared_stock_pool
        ? sharedEditionSize
        : parseEditionSize(formData.get(`variantEditionSize-${tempId}`));
      if (typeof label !== "string" || !label.trim()) return null;
      if (!Number.isFinite(price) || price < 0) return null;
      if (!Number.isFinite(stock) || stock < 0) return null;
      const clampedStock = isOneOff ? Math.min(Math.floor(stock), 1) : Math.floor(stock);
      return {
        product_id: productId,
        label: label.trim(),
        price,
        stock: clampedStock,
        edition_size: editionSize,
        weight_grams: defaultWeightGrams(category, label.trim()),
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);
  if (newRows.length > 0) {
    const { error: insertError } = await supabase.from("product_variants").insert(newRows);
    if (insertError) console.error("Failed to add new product variant(s):", insertError);
  }

  revalidatePath("/vendor");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteProductVariant(formData: FormData): Promise<ActionState> {
  // A falsy session here means the Supabase auth session has actually
  // died server-side (expired refresh token, rotation reuse, etc.) --
  // silently no-opping left the form looking "unresponsive" with zero
  // feedback. Bouncing to login surfaces it and lets a fresh sign-in
  // restore a working session immediately.
  const session = await getSessionRole();
  if (!session) redirect("/admin/login");

  const productId = formData.get("productId");
  const variantId = formData.get("variantId");
  if (typeof productId !== "string" || typeof variantId !== "string") {
    return { ok: false, error: "Missing product or size." };
  }

  const supabase = createAdminClient();
  let ownerQuery = supabase.from("products").select("id").eq("id", productId);
  if (session.role === "vendor") {
    ownerQuery = ownerQuery.eq("artist_id", session.artistId);
  }
  const { data: existingProduct } = await ownerQuery.maybeSingle();
  if (!existingProduct) return { ok: false, error: "Product not found." };

  const { data: variants, error: variantsError } = await supabase
    .from("product_variants")
    .select("id")
    .eq("product_id", productId);
  if (variantsError || !variants) {
    console.error("Failed to load product variants:", variantsError);
    return { ok: false, error: "Something went wrong. Check server logs." };
  }
  // A product always needs at least one buyable size -- same reasoning as
  // deleteProductImage's "needs at least one photo" guard.
  if (variants.length <= 1) {
    return { ok: false, error: "A product needs at least one size -- add another before removing this one." };
  }
  if (!variants.some((v) => v.id === variantId)) {
    return { ok: false, error: "Size not found." };
  }

  // offline_sales.variant_id cascades on delete (see supabase/schema.sql) --
  // unlike order_items below, Postgres won't stop this delete, it'll just
  // silently erase that sales history along with the variant. Checked and
  // blocked here explicitly, since there's no FK violation to catch after
  // the fact the way there is for order_items.
  const { data: offlineSale } = await supabase
    .from("offline_sales")
    .select("id")
    .eq("variant_id", variantId)
    .limit(1)
    .maybeSingle();
  if (offlineSale) {
    return {
      ok: false,
      error: "This size has offline sales logged against it and can't be removed. Set its stock to 0 instead.",
    };
  }

  // order_items.variant_id has no ON DELETE clause (default RESTRICT) -- a
  // variant referenced by a real order fails right here at the DB level,
  // same as deleteProduct's own order_items guard. Caught and surfaced as a
  // clean message rather than a raw constraint-violation error.
  const { error: deleteError } = await supabase
    .from("product_variants")
    .delete()
    .eq("id", variantId)
    .eq("product_id", productId);
  if (deleteError) {
    console.error("Failed to delete product variant:", deleteError);
    return {
      ok: false,
      error: "This size has been ordered before and can't be removed. Set its stock to 0 instead.",
    };
  }

  revalidatePath("/vendor");
  revalidatePath("/");
  return { ok: true };
}

export async function duplicateProduct(formData: FormData): Promise<ActionState> {
  // A falsy session here means the Supabase auth session has actually
  // died server-side (expired refresh token, rotation reuse, etc.) --
  // silently no-opping left the form looking "unresponsive" with zero
  // feedback. Bouncing to login surfaces it and lets a fresh sign-in
  // restore a working session immediately.
  const session = await getSessionRole();
  if (!session) redirect("/admin/login");

  const productId = formData.get("productId");
  const name = formData.get("name");
  if (typeof productId !== "string") return { ok: false, error: "Missing product." };
  if (typeof name !== "string" || !name.trim()) return { ok: false, error: "Name is required." };

  const supabase = createAdminClient();
  let ownerQuery = supabase
    .from("products")
    .select(
      "id, artist_id, category, is_bestseller, is_one_off, is_exclusive_drop, shared_stock_pool, artists(slug), product_variants(label, price, edition_size)"
    )
    .eq("id", productId);
  if (session.role === "vendor") {
    ownerQuery = ownerQuery.eq("artist_id", session.artistId);
  }
  const { data: source } = await ownerQuery.maybeSingle<{
    id: string;
    artist_id: string;
    category: string;
    is_bestseller: boolean;
    is_one_off: boolean;
    is_exclusive_drop: boolean;
    shared_stock_pool: boolean;
    artists: { slug: string } | null;
    product_variants: { label: string; price: number; edition_size: number | null }[];
  }>();
  if (!source || !source.artists) return { ok: false, error: "Product not found." };

  // Same MAX(sort_order)+1 pattern as createProduct -- lands at the end of
  // this stall's list, not wherever the source product happened to sit.
  const { data: maxSortRow } = await supabase
    .from("products")
    .select("sort_order")
    .eq("artist_id", source.artist_id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSortOrder = (maxSortRow?.sort_order ?? -1) + 1;

  const slug = await uniqueProductSlug(supabase, name.trim());

  const { data: created, error } = await supabase
    .from("products")
    .insert({
      artist_id: source.artist_id,
      name: name.trim(),
      slug,
      // Deliberately blank, not copied: a duplicate is a new listing for
      // (usually) different artwork that happens to share the same size/
      // price structure -- the description, photos, and drop countdown are
      // all specific to the original and shouldn't silently carry over.
      description: null,
      category: source.category,
      image_url: null,
      is_bestseller: source.is_bestseller,
      is_one_off: source.is_one_off,
      is_exclusive_drop: source.is_exclusive_drop,
      shared_stock_pool: source.shared_stock_pool,
      sort_order: nextSortOrder,
      // Starts hidden -- it has no photos yet (explicitly not copied) and
      // no fresh stock count, so it isn't ready to sell until the vendor
      // finishes editing it and flips "Active" back on.
      is_active: false,
    })
    .select("id")
    .single();
  if (error || !created) {
    console.error("Failed to duplicate product:", error);
    return { ok: false, error: "Something went wrong. Check server logs." };
  }

  if (source.product_variants.length > 0) {
    const { error: variantsError } = await supabase.from("product_variants").insert(
      source.product_variants.map((v) => ({
        product_id: created.id,
        label: v.label,
        price: v.price,
        // Stock deliberately starts at 0, not copied -- nothing's actually
        // been produced yet for this new listing.
        stock: 0,
        edition_size: v.edition_size,
        weight_grams: defaultWeightGrams(source.category, v.label),
      }))
    );
    if (variantsError) console.error("Failed to duplicate product variants:", variantsError);
  }

  revalidatePath("/");
  // Same redirect-to-clear-and-confirm pattern as createProduct.
  redirect(`/vendor?artist=${source.artists.slug}&created=${created.id}`);
}

// Plenty for what any one product actually needs (a handful of angles/
// colourways) while keeping a vendor from turning this into an unbounded
// upload target -- same bounding instinct as MAX_VARIANT_ROWS above.
const MAX_PRODUCT_IMAGES = 8;

// One file per call, not a batch -- see MAX_UPLOAD_BYTES's own comment in
// lib/image-validation.ts: Vercel's ~4.3MB hard request-body ceiling applies
// to the whole request, not per file, so bundling several near-4MB photos
// into one FormData/Server Action call would 413 before this code ever ran.
// The gallery manager (ProductImageManager) calls this once per selected
// file, sequentially, same as every other upload path in this app already
// does for exactly this reason.
export async function addProductImage(formData: FormData): Promise<ActionState> {
  // A falsy session here means the Supabase auth session has actually
  // died server-side (expired refresh token, rotation reuse, etc.) --
  // silently no-opping left the form looking "unresponsive" with zero
  // feedback. Bouncing to login surfaces it and lets a fresh sign-in
  // restore a working session immediately.
  const session = await getSessionRole();
  if (!session) redirect("/admin/login");

  const productId = formData.get("productId");
  const file = formData.get("photo");
  if (typeof productId !== "string") return { ok: false, error: "Missing product." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a photo to upload." };

  const supabase = createAdminClient();

  // Ownership re-derived from the product's own artist_id, same pattern as
  // updateProduct -- never trust a submitted productId alone for a vendor.
  let ownerQuery = supabase
    .from("products")
    .select("id, image_url, artists(slug)")
    .eq("id", productId);
  if (session.role === "vendor") {
    ownerQuery = ownerQuery.eq("artist_id", session.artistId);
  }
  const { data: existing } = await ownerQuery.maybeSingle<{
    id: string;
    image_url: string | null;
    artists: { slug: string } | null;
  }>();
  if (!existing || !existing.artists) return { ok: false, error: "Product not found." };

  const { data: currentImages } = await supabase
    .from("product_images")
    .select("sort_order")
    .eq("product_id", productId)
    .order("sort_order", { ascending: false });
  if ((currentImages?.length ?? 0) >= MAX_PRODUCT_IMAGES) {
    return { ok: false, error: `A product can have at most ${MAX_PRODUCT_IMAGES} photos.` };
  }
  const nextSortOrder = (currentImages?.[0]?.sort_order ?? -1) + 1;

  const uploaded = await uploadProductPhoto(supabase, existing.artists.slug, file);
  if (!uploaded.ok) return { ok: false, error: uploaded.error };

  const { error: insertError } = await supabase
    .from("product_images")
    .insert({ product_id: productId, url: uploaded.url, sort_order: nextSortOrder });
  if (insertError) {
    console.error("Failed to save uploaded product image:", insertError);
    return { ok: false, error: "Something went wrong. Check server logs." };
  }

  // First photo ever added becomes the card/hero image everywhere (see
  // products.image_url's role in lib/catalogue.ts) -- only fires for a
  // previously imageless product; every other product already has one.
  if (!existing.image_url) {
    await supabase.from("products").update({ image_url: uploaded.url }).eq("id", productId);
  }

  revalidatePath("/vendor");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteProductImage(formData: FormData): Promise<ActionState> {
  // A falsy session here means the Supabase auth session has actually
  // died server-side (expired refresh token, rotation reuse, etc.) --
  // silently no-opping left the form looking "unresponsive" with zero
  // feedback. Bouncing to login surfaces it and lets a fresh sign-in
  // restore a working session immediately.
  const session = await getSessionRole();
  if (!session) redirect("/admin/login");

  const productId = formData.get("productId");
  const imageId = formData.get("imageId");
  if (typeof productId !== "string" || typeof imageId !== "string") {
    return { ok: false, error: "Missing product or photo." };
  }

  const supabase = createAdminClient();
  let ownerQuery = supabase.from("products").select("id").eq("id", productId);
  if (session.role === "vendor") {
    ownerQuery = ownerQuery.eq("artist_id", session.artistId);
  }
  const { data: existing } = await ownerQuery.maybeSingle();
  if (!existing) return { ok: false, error: "Product not found." };

  const { data: images, error: imagesError } = await supabase
    .from("product_images")
    .select("id, url")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true });
  if (imagesError || !images) {
    console.error("Failed to load product images:", imagesError);
    return { ok: false, error: "Something went wrong. Check server logs." };
  }
  // A product always needs at least one photo for its card/hero image --
  // rather than allow the gallery to go empty (and image_url to dangle at
  // null), the vendor has to upload a replacement first.
  if (images.length <= 1) {
    return { ok: false, error: "A product needs at least one photo -- upload another before removing this one." };
  }
  if (!images.some((img) => img.id === imageId)) {
    return { ok: false, error: "Photo not found." };
  }

  const { error: deleteError } = await supabase.from("product_images").delete().eq("id", imageId);
  if (deleteError) {
    console.error("Failed to delete product image:", deleteError);
    return { ok: false, error: "Something went wrong. Check server logs." };
  }

  // Renumber so sort_order stays a clean, gapless 0..n-1 sequence, and sync
  // the card/hero photo (products.image_url) to whatever's first now -- the
  // just-deleted photo may have been it.
  const remaining = images.filter((img) => img.id !== imageId);
  await Promise.all(
    remaining.map((img, index) => supabase.from("product_images").update({ sort_order: index }).eq("id", img.id))
  );
  await supabase.from("products").update({ image_url: remaining[0].url }).eq("id", productId);

  revalidatePath("/vendor");
  revalidatePath("/");
  return { ok: true };
}

export async function reorderProductImages(formData: FormData): Promise<ActionState> {
  // A falsy session here means the Supabase auth session has actually
  // died server-side (expired refresh token, rotation reuse, etc.) --
  // silently no-opping left the form looking "unresponsive" with zero
  // feedback. Bouncing to login surfaces it and lets a fresh sign-in
  // restore a working session immediately.
  const session = await getSessionRole();
  if (!session) redirect("/admin/login");

  const productId = formData.get("productId");
  const imageIds = formData.getAll("imageId") as string[];
  if (typeof productId !== "string" || imageIds.length === 0) {
    return { ok: false, error: "Missing product or photo order." };
  }

  const supabase = createAdminClient();
  let ownerQuery = supabase.from("products").select("id").eq("id", productId);
  if (session.role === "vendor") {
    ownerQuery = ownerQuery.eq("artist_id", session.artistId);
  }
  const { data: existing } = await ownerQuery.maybeSingle();
  if (!existing) return { ok: false, error: "Product not found." };

  const { data: images, error: imagesError } = await supabase
    .from("product_images")
    .select("id, url")
    .eq("product_id", productId);
  if (imagesError || !images) {
    console.error("Failed to load product images:", imagesError);
    return { ok: false, error: "Something went wrong. Check server logs." };
  }

  // Defensive: the submitted order must be exactly this product's current
  // photo set, just reordered -- never trust it to silently add, drop, or
  // reference a different product's rows.
  const currentIds = new Set(images.map((img) => img.id));
  const submittedIds = new Set(imageIds);
  if (currentIds.size !== submittedIds.size || [...currentIds].some((id) => !submittedIds.has(id))) {
    return { ok: false, error: "Photo list is out of date -- refresh and try again." };
  }

  const urlById = new Map(images.map((img) => [img.id, img.url]));
  await Promise.all(
    imageIds.map((id, index) => supabase.from("product_images").update({ sort_order: index }).eq("id", id))
  );
  // First in the new order becomes the card/hero photo everywhere -- see
  // products.image_url's role in lib/catalogue.ts.
  await supabase.from("products").update({ image_url: urlById.get(imageIds[0])! }).eq("id", productId);

  revalidatePath("/vendor");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteProduct(formData: FormData): Promise<ActionState> {
  // A falsy session here means the Supabase auth session has actually
  // died server-side (expired refresh token, rotation reuse, etc.) --
  // silently no-opping left the form looking "unresponsive" with zero
  // feedback. Bouncing to login surfaces it and lets a fresh sign-in
  // restore a working session immediately.
  const session = await getSessionRole();
  if (!session) redirect("/admin/login");

  const productId = formData.get("productId");
  if (typeof productId !== "string") return { ok: false, error: "Missing product." };

  const supabase = createAdminClient();
  let query = supabase.from("products").delete().eq("id", productId);
  if (session.role === "vendor") {
    query = query.eq("artist_id", session.artistId);
  }
  // A product that has been ordered before is referenced by order_items
  // (no ON DELETE on that FK by design -- see supabase/schema.sql), so the
  // delete fails there rather than silently orphaning order history. Surface
  // that as a real message now instead of swallowing it -- the vendor can
  // still archive it instead via the "Active" checkbox.
  //
  // .select("id") is the only way to tell "actually deleted a row" apart
  // from "matched nothing" -- delete() with no error and no matching row
  // (e.g. a vendor's artist_id filter excluding a product that belongs to
  // another stall) otherwise returns the exact same {error: null} as a real
  // delete, which was silently reporting ok:true for a no-op.
  const { data, error } = await query.select("id");
  if (error) {
    console.error("Failed to delete product:", error);
    return { ok: false, error: "Couldn't delete -- it may already have orders. Try archiving it instead." };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Product not found." };
  }

  revalidatePath("/vendor");
  revalidatePath("/");
  return { ok: true };
}

export async function createFreebie(formData: FormData): Promise<ActionState> {
  // A falsy session here means the Supabase auth session has actually
  // died server-side (expired refresh token, rotation reuse, etc.) --
  // silently no-opping left the form looking "unresponsive" with zero
  // feedback. Bouncing to login surfaces it and lets a fresh sign-in
  // restore a working session immediately.
  const session = await getSessionRole();
  if (!session) redirect("/admin/login");

  const artistId = formData.get("artistId");
  const title = formData.get("title");
  const description = formData.get("description");
  const category = formData.get("category");
  const file = formData.get("file");
  const thumbnail = formData.get("thumbnail");
  if (typeof artistId !== "string" || typeof title !== "string" || !title.trim()) {
    return { ok: false, error: "Title is required." };
  }
  if (typeof category !== "string" || !FREEBIE_CATEGORY_ORDER.includes(category)) {
    return { ok: false, error: "Choose a valid category." };
  }
  if (session.role === "vendor" && artistId !== session.artistId) {
    return { ok: false, error: "You don't have permission to add freebies to this stall." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file to upload." };
  }

  // Validate the file AND the (optional) thumbnail before uploading either
  // one -- an invalid thumbnail failing after the file was already uploaded
  // would leave that file orphaned in storage with no freebie row ever
  // created to point at it.
  const fileValidation = await validateUpload(file, "freebie");
  if (!fileValidation.ok) return { ok: false, error: fileValidation.error };

  let thumbnailValidation: Extract<UploadValidationResult, { ok: true }> | null = null;
  if (thumbnail instanceof File && thumbnail.size > 0) {
    const validated = await validateUpload(thumbnail, "image");
    if (!validated.ok) return { ok: false, error: validated.error };
    thumbnailValidation = validated;
  }

  const supabase = createAdminClient();
  const { data: artist } = await supabase
    .from("artists")
    .select("slug")
    .eq("id", artistId)
    .maybeSingle();
  if (!artist) return { ok: false, error: "Stall not found." };

  const uploadedFile = await uploadValidatedFreebieFile(supabase, artist.slug, "file", fileValidation);
  if (!uploadedFile.ok) return { ok: false, error: uploadedFile.error };

  let thumbnailUrl: string | null = null;
  if (thumbnailValidation) {
    const uploadedThumbnail = await uploadValidatedFreebieFile(supabase, artist.slug, "thumbnail", thumbnailValidation);
    if (!uploadedThumbnail.ok) return { ok: false, error: uploadedThumbnail.error };
    thumbnailUrl = uploadedThumbnail.url;
  }

  const { error } = await supabase.from("freebies").insert({
    artist_id: artistId,
    title: title.trim(),
    description: typeof description === "string" && description.trim() ? description.trim() : null,
    category,
    file_url: uploadedFile.url,
    thumbnail_url: thumbnailUrl,
  });
  if (error) {
    console.error("Failed to create freebie:", error);
    return { ok: false, error: "Something went wrong. Check server logs." };
  }

  revalidatePath("/vendor");
  revalidatePath("/freebies");
  return { ok: true };
}

export async function deleteFreebie(formData: FormData): Promise<ActionState> {
  // A falsy session here means the Supabase auth session has actually
  // died server-side (expired refresh token, rotation reuse, etc.) --
  // silently no-opping left the form looking "unresponsive" with zero
  // feedback. Bouncing to login surfaces it and lets a fresh sign-in
  // restore a working session immediately.
  const session = await getSessionRole();
  if (!session) redirect("/admin/login");

  const freebieId = formData.get("freebieId");
  if (typeof freebieId !== "string") return { ok: false, error: "Missing freebie." };

  const supabase = createAdminClient();
  let query = supabase.from("freebies").delete().eq("id", freebieId);
  if (session.role === "vendor") {
    query = query.eq("artist_id", session.artistId);
  }
  // .select("id") is the only way to tell "actually deleted a row" apart
  // from "matched nothing" -- see deleteProduct's own comment on this same
  // pattern above.
  const { data, error } = await query.select("id");
  if (error) {
    console.error("Failed to delete freebie:", error);
    return { ok: false, error: "Something went wrong. Check server logs." };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Freebie not found." };
  }

  revalidatePath("/vendor");
  revalidatePath("/freebies");
  return { ok: true };
}

export async function changePassword(formData: FormData): Promise<ActionState> {
  // A falsy session here means the Supabase auth session has actually
  // died server-side (expired refresh token, rotation reuse, etc.) --
  // silently no-opping left the form looking "unresponsive" with zero
  // feedback. Bouncing to login surfaces it and lets a fresh sign-in
  // restore a working session immediately.
  const session = await getSessionRole();
  if (!session) redirect("/admin/login");

  const newPassword = formData.get("newPassword");
  const confirmPassword = formData.get("confirmPassword");
  if (typeof newPassword !== "string" || typeof confirmPassword !== "string") {
    return { ok: false, error: "Missing required fields." };
  }
  if (newPassword.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  if (newPassword !== confirmPassword) return { ok: false, error: "Passwords don't match." };

  // Operates on whichever user the request's session cookie belongs to --
  // the anon-key, cookie-bound client, not the service-role admin client --
  // so this can only ever change the caller's own password.
  const supabase = await createAuthClient();
  const { data: updated, error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    console.error("Failed to update password:", error);
    return { ok: false, error: "Something went wrong. Check server logs." };
  }

  // Clears the "still on the TempPasswordReveal-issued password" flag
  // (see app/admin/vendors/create/route.ts, and middleware.ts for what
  // actually enforces it) now that a real password is set. app_metadata
  // can only be touched via the Admin API, not a user's own session --
  // updateUserById merges into the existing app_metadata rather than
  // replacing it (verified against this project's own Supabase Auth
  // before relying on it), so role/artist_id survive untouched.
  if (session.role === "vendor" && session.mustChangePassword && updated.user) {
    const adminSupabase = createAdminClient();
    const { error: metadataError } = await adminSupabase.auth.admin.updateUserById(updated.user.id, {
      app_metadata: { must_change_password: false },
    });
    if (metadataError) {
      // The password itself already changed successfully -- don't fail
      // the whole action over this. Worst case, middleware sends them
      // back through this same form once more next time, which is safe,
      // just an extra step.
      console.error("Failed to clear must_change_password flag:", metadataError);
    }
  }

  return { ok: true };
}
