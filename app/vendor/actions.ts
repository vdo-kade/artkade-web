"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient as createAuthClient } from "@/lib/supabase-server";
import { getSessionRole } from "@/lib/session-role";
import { CATEGORY_ORDER } from "@/lib/catalogue";
import { uploadStallPhotoFile, type PhotoField } from "@/lib/storage";
import { runPopupLifecycleTick } from "@/lib/popup-expiry";

// Every action here re-derives the caller's role/artist from their session
// (never trusts a client-submitted artistId) and scopes the write to that
// artist for vendors -- admin writes are unscoped. Mirrors the ownership
// pattern already used by app/admin/orders/actions.ts (service-role client
// + explicit filters, no RLS).

export async function updateStallDetails(formData: FormData) {
  const session = await getSessionRole();
  if (!session) return;

  const artistId = formData.get("artistId");
  const name = formData.get("name");
  const tagline = formData.get("tagline");
  const bio = formData.get("bio");
  const isPopup = formData.get("isPopup") === "on";
  const popupStartsAtRaw = formData.get("popupStartsAt");
  const popupEndsAtRaw = formData.get("popupEndsAt");
  if (typeof artistId !== "string" || typeof name !== "string") return;
  if (session.role === "vendor" && artistId !== session.artistId) return;

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
  await supabase
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

  // Applies any consequence of the new dates immediately (e.g. an end date
  // just pushed into the past archives right away) rather than waiting for
  // the next cron tick or dashboard visit. Safe to always run: it only ever
  // activates a currently-inactive scheduled stall whose start has arrived,
  // or archives a currently-active one whose end has passed -- it never
  // deactivates a live stall just because its start date moved.
  await runPopupLifecycleTick(supabase);

  revalidatePath("/vendor");
  revalidatePath("/");
}

const PHOTO_FIELDS = ["logo_url", "hero_image_url"] as const;

export async function uploadStallPhoto(formData: FormData) {
  const session = await getSessionRole();
  if (!session) return;

  const artistId = formData.get("artistId");
  const field = formData.get("field");
  const file = formData.get("file");
  if (typeof artistId !== "string" || typeof field !== "string") return;
  if (!PHOTO_FIELDS.includes(field as PhotoField)) return;
  if (session.role === "vendor" && artistId !== session.artistId) return;
  if (!(file instanceof File) || file.size === 0) return;

  const supabase = createAdminClient();
  const { data: artist } = await supabase
    .from("artists")
    .select("slug")
    .eq("id", artistId)
    .maybeSingle();
  if (!artist) return;

  const publicUrl = await uploadStallPhotoFile(supabase, artist.slug, field as PhotoField, file);
  if (!publicUrl) return;

  await supabase
    .from("artists")
    .update({ [field as PhotoField]: publicUrl })
    .eq("id", artistId);

  revalidatePath("/vendor");
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

export async function createProduct(formData: FormData) {
  const session = await getSessionRole();
  if (!session) return;

  const artistId = formData.get("artistId");
  const name = formData.get("name");
  const description = formData.get("description");
  const category = formData.get("category");
  const file = formData.get("photo");
  if (typeof artistId !== "string" || typeof name !== "string" || !name.trim()) return;
  if (typeof category !== "string" || !CATEGORY_ORDER.includes(category)) return;
  if (session.role === "vendor" && artistId !== session.artistId) return;

  const variants: { label: string; price: number; stock: number }[] = [];
  for (let i = 0; i < MAX_VARIANT_ROWS; i++) {
    const label = formData.get(`variantLabel-${i}`);
    const price = Number(formData.get(`variantPrice-${i}`));
    const stock = Number(formData.get(`variantStock-${i}`));
    if (typeof label !== "string" || !label.trim()) continue;
    if (!Number.isFinite(price) || price < 0) continue;
    variants.push({
      label: label.trim(),
      price,
      stock: Number.isFinite(stock) && stock > 0 ? Math.floor(stock) : 0,
    });
  }
  if (variants.length === 0) return;

  const supabase = createAdminClient();
  const { data: artist } = await supabase
    .from("artists")
    .select("slug")
    .eq("id", artistId)
    .maybeSingle();
  if (!artist) return;

  const { count } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("artist_id", artistId);

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
      sort_order: count ?? 0,
    })
    .select("id")
    .single();
  if (error || !product) {
    console.error("Failed to create product:", error);
    return;
  }

  await supabase.from("product_variants").insert(
    variants.map((v) => ({ product_id: product.id, label: v.label, price: v.price, stock: v.stock }))
  );

  revalidatePath("/vendor");
  revalidatePath("/");
}

export async function updateProduct(formData: FormData) {
  const session = await getSessionRole();
  if (!session) return;

  const productId = formData.get("productId");
  const name = formData.get("name");
  const description = formData.get("description");
  const category = formData.get("category");
  const isActive = formData.get("isActive") === "on";
  const file = formData.get("photo");
  if (typeof productId !== "string") return;
  if (typeof name !== "string" || !name.trim()) return;
  if (typeof category !== "string" || !CATEGORY_ORDER.includes(category)) return;

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
  if (!existing || !existing.artists) return;

  let imageUrl: string | undefined;
  if (file instanceof File && file.size > 0) {
    const uploaded = await uploadProductPhoto(supabase, existing.artists.slug, file);
    if (uploaded) imageUrl = uploaded;
  }

  await supabase
    .from("products")
    .update({
      name: name.trim(),
      description: typeof description === "string" && description.trim() ? description.trim() : null,
      category,
      is_active: isActive,
      ...(imageUrl ? { image_url: imageUrl } : {}),
    })
    .eq("id", productId);

  const variantIds = formData.getAll("variantId") as string[];
  await Promise.all(
    variantIds.map((variantId) => {
      const label = formData.get(`variantLabel-${variantId}`);
      const price = Number(formData.get(`variantPrice-${variantId}`));
      const stock = Number(formData.get(`variantStock-${variantId}`));
      if (typeof label !== "string" || !label.trim()) return null;
      if (!Number.isFinite(price) || price < 0) return null;
      if (!Number.isFinite(stock) || stock < 0) return null;
      return supabase
        .from("product_variants")
        .update({ label: label.trim(), price, stock: Math.floor(stock) })
        .eq("id", variantId)
        .eq("product_id", productId);
    })
  );

  revalidatePath("/vendor");
  revalidatePath("/");
}

export async function deleteProduct(formData: FormData) {
  const session = await getSessionRole();
  if (!session) return;

  const productId = formData.get("productId");
  if (typeof productId !== "string") return;

  const supabase = createAdminClient();
  let query = supabase.from("products").delete().eq("id", productId);
  if (session.role === "vendor") {
    query = query.eq("artist_id", session.artistId);
  }
  // A product that has been ordered before is referenced by order_items
  // (no ON DELETE on that FK by design -- see supabase/schema.sql), so the
  // delete fails there rather than silently orphaning order history. That's
  // logged and swallowed like every other write in this file; the vendor
  // can still archive it instead via the "Active" checkbox.
  const { error } = await query;
  if (error) console.error("Failed to delete product:", error);

  revalidatePath("/vendor");
  revalidatePath("/");
}

export async function changePassword(formData: FormData) {
  const session = await getSessionRole();
  if (!session) return;

  const newPassword = formData.get("newPassword");
  const confirmPassword = formData.get("confirmPassword");
  if (typeof newPassword !== "string" || typeof confirmPassword !== "string") return;
  if (newPassword.length < 8 || newPassword !== confirmPassword) return;

  // Operates on whichever user the request's session cookie belongs to --
  // the anon-key, cookie-bound client, not the service-role admin client --
  // so this can only ever change the caller's own password.
  const supabase = await createAuthClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) console.error("Failed to update password:", error);
}
