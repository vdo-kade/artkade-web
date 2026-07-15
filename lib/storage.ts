import type { createAdminClient } from "./supabase-admin";

const PHOTO_FIELDS = ["logo_url", "hero_image_url"] as const;
export type PhotoField = (typeof PHOTO_FIELDS)[number];

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
