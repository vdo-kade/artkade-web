"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { getSessionRole } from "@/lib/session-role";
import { slugify } from "@/lib/slugify";

// Magazine is site-wide editorial content, not per-stall -- admin-only,
// entirely separate from app/vendor/actions.ts's vendor-scoped writes.

async function uploadMagazineHero(
  supabase: ReturnType<typeof createAdminClient>,
  slug: string,
  file: File
): Promise<string | null> {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "png";
  const path = `magazine/${slug}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("media")
    .upload(path, await file.arrayBuffer(), { contentType: file.type || "application/octet-stream" });
  if (error) {
    console.error("Magazine hero upload failed:", error);
    return null;
  }
  const {
    data: { publicUrl },
  } = supabase.storage.from("media").getPublicUrl(path);
  return publicUrl;
}

export async function createPost(formData: FormData) {
  // A non-admin session here almost always means the auth session died
  // server-side (expired/rotated refresh token) rather than a real
  // authorization denial -- silently no-opping left the form looking
  // "unresponsive" with zero feedback. Bounce to login so a fresh
  // sign-in restores a working session immediately.
  const session = await getSessionRole();
  if (session?.role !== "admin") redirect("/admin/login");

  const title = formData.get("title");
  const excerpt = formData.get("excerpt");
  const body = formData.get("body");
  const category = formData.get("category");
  const artistId = formData.get("artistId");
  const published = formData.get("published") === "on";
  const file = formData.get("hero");
  if (typeof title !== "string" || !title.trim()) return;

  const supabase = createAdminClient();

  const baseSlug = slugify(title);
  let slug = baseSlug;
  for (let attempt = 2; ; attempt++) {
    const { data: existing } = await supabase.from("magazine_posts").select("id").eq("slug", slug).maybeSingle();
    if (!existing) break;
    slug = `${baseSlug}-${attempt}`;
  }

  let heroUrl: string | null = null;
  if (file instanceof File && file.size > 0) {
    heroUrl = await uploadMagazineHero(supabase, slug, file);
  }

  const { error } = await supabase.from("magazine_posts").insert({
    slug,
    title: title.trim(),
    excerpt: typeof excerpt === "string" && excerpt.trim() ? excerpt.trim() : null,
    body: typeof body === "string" && body.trim() ? body.trim() : null,
    category: typeof category === "string" && category.trim() ? category.trim() : null,
    artist_id: typeof artistId === "string" && artistId ? artistId : null,
    hero_image_url: heroUrl,
    published,
    published_at: published ? new Date().toISOString() : null,
  });
  if (error) {
    console.error("Failed to create magazine post:", error);
    return;
  }

  revalidatePath("/admin/magazine");
  revalidatePath("/magazine");
  // Same reasoning as app/vendor/actions.ts's createProduct: a redirect (not
  // just revalidatePath) is what actually clears this plain uncontrolled form.
  redirect("/admin/magazine");
}

export async function updatePost(formData: FormData) {
  // A non-admin session here almost always means the auth session died
  // server-side (expired/rotated refresh token) rather than a real
  // authorization denial -- silently no-opping left the form looking
  // "unresponsive" with zero feedback. Bounce to login so a fresh
  // sign-in restores a working session immediately.
  const session = await getSessionRole();
  if (session?.role !== "admin") redirect("/admin/login");

  const id = formData.get("id");
  const title = formData.get("title");
  const excerpt = formData.get("excerpt");
  const body = formData.get("body");
  const category = formData.get("category");
  const artistId = formData.get("artistId");
  const published = formData.get("published") === "on";
  const file = formData.get("hero");
  if (typeof id !== "string" || typeof title !== "string" || !title.trim()) return;

  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("magazine_posts")
    .select("slug, published_at")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return;

  let heroUrl: string | undefined;
  if (file instanceof File && file.size > 0) {
    const uploaded = await uploadMagazineHero(supabase, existing.slug, file);
    if (uploaded) heroUrl = uploaded;
  }

  // Only stamped the first time a post goes live -- re-saving an already-
  // published post (or toggling it back on later) doesn't reset its date.
  const publishedAt = published && !existing.published_at ? new Date().toISOString() : existing.published_at;

  await supabase
    .from("magazine_posts")
    .update({
      title: title.trim(),
      excerpt: typeof excerpt === "string" && excerpt.trim() ? excerpt.trim() : null,
      body: typeof body === "string" && body.trim() ? body.trim() : null,
      category: typeof category === "string" && category.trim() ? category.trim() : null,
      artist_id: typeof artistId === "string" && artistId ? artistId : null,
      published,
      published_at: publishedAt,
      ...(heroUrl ? { hero_image_url: heroUrl } : {}),
    })
    .eq("id", id);

  revalidatePath("/admin/magazine");
  revalidatePath("/magazine");
  revalidatePath(`/magazine/${existing.slug}`);
}

export async function deletePost(formData: FormData) {
  // A non-admin session here almost always means the auth session died
  // server-side (expired/rotated refresh token) rather than a real
  // authorization denial -- silently no-opping left the form looking
  // "unresponsive" with zero feedback. Bounce to login so a fresh
  // sign-in restores a working session immediately.
  const session = await getSessionRole();
  if (session?.role !== "admin") redirect("/admin/login");

  const id = formData.get("id");
  if (typeof id !== "string") return;

  const supabase = createAdminClient();
  const { error } = await supabase.from("magazine_posts").delete().eq("id", id);
  if (error) console.error("Failed to delete magazine post:", error);

  revalidatePath("/admin/magazine");
  revalidatePath("/magazine");
}
