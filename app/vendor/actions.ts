"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient as createAuthClient } from "@/lib/supabase-server";
import { getSessionRole } from "@/lib/session-role";
import { CATEGORY_ORDER } from "@/lib/catalogue";
import { defaultWeightGrams } from "@/lib/shipping";
import { FREEBIE_CATEGORY_ORDER } from "@/lib/freebies";
import { uploadStallPhotoFile, uploadFreebieFile, type PhotoField } from "@/lib/storage";
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

  const publicUrl = await uploadStallPhotoFile(supabase, artist.slug, field as PhotoField, file);
  if (!publicUrl) return { ok: false, error: "Upload failed. Check server logs." };

  const { error } = await supabase
    .from("artists")
    .update({ [field as PhotoField]: publicUrl })
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

async function uploadProductPhoto(
  supabase: ReturnType<typeof createAdminClient>,
  artistSlug: string,
  file: File
): Promise<string | null> {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "png";
  const path = `products/${artistSlug}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("media")
    .upload(path, await file.arrayBuffer(), {
      contentType: file.type || "application/octet-stream",
    });
  if (uploadError) {
    console.error("Product photo upload failed:", uploadError);
    return null;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("media").getPublicUrl(path);
  return publicUrl;
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
    imageUrl = await uploadProductPhoto(supabase, artist.slug, file);
  }

  const { data: product, error } = await supabase
    .from("products")
    .insert({
      artist_id: artistId,
      name: name.trim(),
      description: typeof description === "string" && description.trim() ? description.trim() : null,
      category,
      image_url: imageUrl,
      is_one_off: isOneOff,
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
  const file = formData.get("photo");
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
    .select("id, artists(slug)")
    .eq("id", productId);
  if (session.role === "vendor") {
    ownerQuery = ownerQuery.eq("artist_id", session.artistId);
  }
  const { data: existing } = await ownerQuery.maybeSingle<{ id: string; artists: { slug: string } | null }>();
  if (!existing || !existing.artists) return { ok: false, error: "Product not found." };

  let imageUrl: string | undefined;
  if (file instanceof File && file.size > 0) {
    const uploaded = await uploadProductPhoto(supabase, existing.artists.slug, file);
    if (uploaded) imageUrl = uploaded;
  }

  const { error } = await supabase
    .from("products")
    .update({
      name: name.trim(),
      description: typeof description === "string" && description.trim() ? description.trim() : null,
      category,
      is_active: isActive,
      is_one_off: isOneOff,
      ...(imageUrl ? { image_url: imageUrl } : {}),
    })
    .eq("id", productId);
  if (error) {
    console.error("Failed to update product:", error);
    return { ok: false, error: "Something went wrong. Check server logs." };
  }

  const variantIds = formData.getAll("variantId") as string[];
  const variantResults = await Promise.all(
    variantIds.map((variantId) => {
      const label = formData.get(`variantLabel-${variantId}`);
      const price = Number(formData.get(`variantPrice-${variantId}`));
      const stock = Number(formData.get(`variantStock-${variantId}`));
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
  const { error } = await query;
  if (error) {
    console.error("Failed to delete product:", error);
    return { ok: false, error: "Couldn't delete -- it may already have orders. Try archiving it instead." };
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

  const supabase = createAdminClient();
  const { data: artist } = await supabase
    .from("artists")
    .select("slug")
    .eq("id", artistId)
    .maybeSingle();
  if (!artist) return { ok: false, error: "Stall not found." };

  const fileUrl = await uploadFreebieFile(supabase, artist.slug, "file", file);
  if (!fileUrl) return { ok: false, error: "File upload failed. Check server logs." };

  let thumbnailUrl: string | null = null;
  if (thumbnail instanceof File && thumbnail.size > 0) {
    thumbnailUrl = await uploadFreebieFile(supabase, artist.slug, "thumbnail", thumbnail);
  }

  const { error } = await supabase.from("freebies").insert({
    artist_id: artistId,
    title: title.trim(),
    description: typeof description === "string" && description.trim() ? description.trim() : null,
    category,
    file_url: fileUrl,
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
  const { error } = await query;
  if (error) {
    console.error("Failed to delete freebie:", error);
    return { ok: false, error: "Something went wrong. Check server logs." };
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
