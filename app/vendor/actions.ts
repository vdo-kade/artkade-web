"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase-admin";
import { getSessionRole } from "@/lib/session-role";

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
  if (typeof artistId !== "string" || typeof name !== "string") return;
  if (session.role === "vendor" && artistId !== session.artistId) return;

  const supabase = createAdminClient();
  await supabase
    .from("artists")
    .update({
      name,
      tagline: typeof tagline === "string" ? tagline : null,
      bio: typeof bio === "string" ? bio : null,
    })
    .eq("id", artistId);

  revalidatePath("/vendor");
}

const PHOTO_FIELDS = ["logo_url", "hero_image_url"] as const;
type PhotoField = (typeof PHOTO_FIELDS)[number];

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

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "png";
  const path = `stalls/${artist.slug}/${field}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("media")
    .upload(path, await file.arrayBuffer(), {
      contentType: file.type || "application/octet-stream",
    });
  if (uploadError) {
    console.error("Stall photo upload failed:", uploadError);
    return;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("media").getPublicUrl(path);

  await supabase
    .from("artists")
    .update({ [field as PhotoField]: publicUrl })
    .eq("id", artistId);

  revalidatePath("/vendor");
}

export async function updateProductAndStock(formData: FormData) {
  const session = await getSessionRole();
  if (!session) return;

  const productId = formData.get("productId");
  if (typeof productId !== "string") return;
  const isActive = formData.get("isActive") === "on";

  const supabase = createAdminClient();

  let productUpdate = supabase.from("products").update({ is_active: isActive }).eq("id", productId);
  if (session.role === "vendor") {
    productUpdate = productUpdate.eq("artist_id", session.artistId);
  }
  const { data: updated, error } = await productUpdate.select("id");
  // Empty result means either the product doesn't exist or (for a vendor)
  // belongs to a different artist -- either way, stop before touching variants.
  if (error || !updated || updated.length === 0) return;

  const variantIds = formData.getAll("variantId") as string[];
  await Promise.all(
    variantIds.map((variantId) => {
      const stock = Number(formData.get(`stock-${variantId}`));
      if (!Number.isFinite(stock) || stock < 0) return null;
      return supabase
        .from("product_variants")
        .update({ stock: Math.floor(stock) })
        .eq("id", variantId)
        .eq("product_id", productId);
    })
  );

  revalidatePath("/vendor");
}
