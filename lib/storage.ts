import type { createAdminClient } from "./supabase-admin";

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

const PHOTO_FIELDS = ["logo_url", "hero_image_url"] as const;
export type PhotoField = (typeof PHOTO_FIELDS)[number];

// Freebies can be any file type (audio, PDF, image, etc), unlike the
// image-only uploads above -- content type is passed straight through
// from the browser File rather than assumed.
export async function uploadFreebieFile(
  supabase: ReturnType<typeof createAdminClient>,
  slug: string,
  kind: "file" | "thumbnail",
  file: File
): Promise<string | null> {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const path = `freebies/${slug}/${kind}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("media")
    .upload(path, await file.arrayBuffer(), {
      contentType: file.type || "application/octet-stream",
    });
  if (uploadError) {
    console.error("Freebie file upload failed:", uploadError);
    return null;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("media").getPublicUrl(path);
  return publicUrl;
}

// Shared by app/vendor/actions.ts's uploadStallPhoto (existing stalls) and
// the pop-up vendor creation route (brand new stalls) -- same bucket, same
// stalls/<slug>/<field>-<timestamp>.<ext> path convention either way.
export async function uploadStallPhotoFile(
  supabase: ReturnType<typeof createAdminClient>,
  slug: string,
  field: PhotoField,
  file: File
): Promise<string | null> {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "png";
  const path = `stalls/${slug}/${field}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("media")
    .upload(path, await file.arrayBuffer(), {
      contentType: file.type || "application/octet-stream",
    });
  if (uploadError) {
    console.error("Stall photo upload failed:", uploadError);
    return null;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("media").getPublicUrl(path);
  return publicUrl;
}
