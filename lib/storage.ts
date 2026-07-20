import type { createAdminClient } from "./supabase-admin";
import { validateUpload } from "./image-validation";

export type StorageUploadResult = { ok: true; url: string } | { ok: false; error: string };

// Payment proof paths are client-submitted to placeOrder (see
// app/checkout/actions.ts) after a separate upload call to
// /api/upload-payment-proof -- nothing stops a request from skipping that
// upload and just naming an arbitrary path instead, since there was never
// anything checking the two actually correspond. This is what closes that
// gap: a real object under that exact key in the private bucket, not just
// a plausible-looking string. Objects sit flat at the bucket root (no
// subfolders -- see the route's own path convention), so listing the root
// with a search filter is enough; no need to walk a directory tree.
export async function paymentProofExists(
  supabase: ReturnType<typeof createAdminClient>,
  path: string
): Promise<boolean> {
  const { data, error } = await supabase.storage.from("payment-proofs").list("", { search: path, limit: 1 });
  if (error) {
    console.error("Failed to verify payment proof exists:", error);
    return false;
  }
  return (data ?? []).some((f) => f.name === path);
}

// Called the moment an order goes rejected/cancelled/out_of_stock (see
// PROOF_CLEANUP_STATUSES in app/admin/orders/actions.ts) -- the proof
// screenshot has no further purpose once an order lands there, so it's
// deleted immediately rather than left to accumulate in the private
// bucket forever. Fire-and-log like restoreStock's callers: a delete
// failure here shouldn't turn an otherwise-successful status transition
// into an error for the admin.
export async function deletePaymentProof(
  supabase: ReturnType<typeof createAdminClient>,
  path: string
): Promise<void> {
  const { error } = await supabase.storage.from("payment-proofs").remove([path]);
  if (error) console.error(`Failed to delete payment proof at ${path}:`, error);
}

const PHOTO_FIELDS = ["logo_url", "hero_image_url"] as const;
export type PhotoField = (typeof PHOTO_FIELDS)[number];

// Freebies can be any file type (audio, PDF, image, etc), unlike the
// image-only uploads below -- "file" is sniffed against the wider freebie
// allowlist (see lib/image-validation.ts), "thumbnail" is always a real
// image. Either way, the byte signature actually found is what's stored as
// the content type, not whatever label the browser's File.type sent --
// same reasoning as /api/upload-payment-proof, now applied here too instead
// of trusting the client's claim.
export async function uploadFreebieFile(
  supabase: ReturnType<typeof createAdminClient>,
  slug: string,
  kind: "file" | "thumbnail",
  file: File
): Promise<StorageUploadResult> {
  const validated = await validateUpload(file, kind === "thumbnail" ? "image" : "freebie");
  if (!validated.ok) return validated;

  const path = `freebies/${slug}/${kind}-${Date.now()}.${validated.ext}`;

  const { error: uploadError } = await supabase.storage
    .from("media")
    .upload(path, validated.bytes, { contentType: validated.mime });
  if (uploadError) {
    console.error("Freebie file upload failed:", uploadError);
    return { ok: false, error: "Upload failed. Check server logs." };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("media").getPublicUrl(path);
  return { ok: true, url: publicUrl };
}

// Shared by app/vendor/actions.ts's uploadStallPhoto (existing stalls) and
// the pop-up vendor creation route (brand new stalls) -- same bucket, same
// stalls/<slug>/<field>-<timestamp>.<ext> path convention either way. Same
// real magic-byte + size-cap validation as payment proof (see
// lib/image-validation.ts) -- these are meant to always be real photos.
export async function uploadStallPhotoFile(
  supabase: ReturnType<typeof createAdminClient>,
  slug: string,
  field: PhotoField,
  file: File
): Promise<StorageUploadResult> {
  const validated = await validateUpload(file, "image");
  if (!validated.ok) return validated;

  const path = `stalls/${slug}/${field}-${Date.now()}.${validated.ext}`;

  const { error: uploadError } = await supabase.storage
    .from("media")
    .upload(path, validated.bytes, { contentType: validated.mime });
  if (uploadError) {
    console.error("Stall photo upload failed:", uploadError);
    return { ok: false, error: "Upload failed. Check server logs." };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("media").getPublicUrl(path);
  return { ok: true, url: publicUrl };
}
