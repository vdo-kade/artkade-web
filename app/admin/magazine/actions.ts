"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { getSessionRole } from "@/lib/session-role";
import { slugify } from "@/lib/slugify";
import { validateUpload } from "@/lib/image-validation";
import type { ActionState } from "@/lib/action-state";

// Magazine is site-wide editorial content, not per-stall -- admin-only,
// entirely separate from app/vendor/actions.ts's vendor-scoped writes.

// Same real magic-byte + size-cap validation as payment proof (see
// lib/image-validation.ts) rather than trusting file.type.
async function uploadMagazineHero(
  supabase: ReturnType<typeof createAdminClient>,
  slug: string,
  file: File
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const validated = await validateUpload(file, "image");
  if (!validated.ok) return validated;

  const path = `magazine/${slug}-${Date.now()}.${validated.ext}`;
  const { error } = await supabase.storage
    .from("media")
    .upload(path, validated.bytes, { contentType: validated.mime });
  if (error) {
    console.error("Magazine hero upload failed:", error);
    return { ok: false, error: "Upload failed. Check server logs." };
  }
  const {
    data: { publicUrl },
  } = supabase.storage.from("media").getPublicUrl(path);
  return { ok: true, url: publicUrl };
}

export async function createPost(formData: FormData): Promise<ActionState> {
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
  if (typeof title !== "string" || !title.trim()) return { ok: false, error: "Title is required." };

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
    const uploaded = await uploadMagazineHero(supabase, slug, file);
    if (!uploaded.ok) return { ok: false, error: uploaded.error };
    heroUrl = uploaded.url;
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
    return { ok: false, error: "Something went wrong. Check server logs." };
  }

  revalidatePath("/admin/magazine");
  revalidatePath("/magazine");
  // Same reasoning as app/vendor/actions.ts's createProduct: a redirect (not
  // just revalidatePath) is what actually clears this plain uncontrolled form.
  redirect("/admin/magazine");
}

export async function updatePost(formData: FormData): Promise<ActionState> {
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
  if (typeof id !== "string" || typeof title !== "string" || !title.trim()) {
    return { ok: false, error: "Title is required." };
  }

  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("magazine_posts")
    .select("slug, published_at")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Post not found." };

  let heroUrl: string | undefined;
  if (file instanceof File && file.size > 0) {
    const uploaded = await uploadMagazineHero(supabase, existing.slug, file);
    if (!uploaded.ok) return { ok: false, error: uploaded.error };
    heroUrl = uploaded.url;
  }

  // Only stamped the first time a post goes live -- re-saving an already-
  // published post (or toggling it back on later) doesn't reset its date.
  const publishedAt = published && !existing.published_at ? new Date().toISOString() : existing.published_at;

  const { error } = await supabase
    .from("magazine_posts")
    .update({
      title: title.trim(),
      excerpt: typeof excerpt === "string" && excerpt.trim() ? excerpt.trim() : null,
      category: typeof category === "string" && category.trim() ? category.trim() : null,
      artist_id: typeof artistId === "string" && artistId ? artistId : null,
      body: typeof body === "string" && body.trim() ? body.trim() : null,
      published,
      published_at: publishedAt,
      ...(heroUrl ? { hero_image_url: heroUrl } : {}),
    })
    .eq("id", id);
  if (error) {
    console.error("Failed to update magazine post:", error);
    return { ok: false, error: "Something went wrong. Check server logs." };
  }

  revalidatePath("/admin/magazine");
  revalidatePath("/magazine");
  revalidatePath(`/magazine/${existing.slug}`);
  return { ok: true };
}

export async function deletePost(formData: FormData): Promise<ActionState> {
  // A non-admin session here almost always means the auth session died
  // server-side (expired/rotated refresh token) rather than a real
  // authorization denial -- silently no-opping left the form looking
  // "unresponsive" with zero feedback. Bounce to login so a fresh
  // sign-in restores a working session immediately.
  const session = await getSessionRole();
  if (session?.role !== "admin") redirect("/admin/login");

  const id = formData.get("id");
  if (typeof id !== "string") return { ok: false, error: "Missing post." };

  const supabase = createAdminClient();
  const { error } = await supabase.from("magazine_posts").delete().eq("id", id);
  if (error) {
    console.error("Failed to delete magazine post:", error);
    return { ok: false, error: "Something went wrong. Check server logs." };
  }

  revalidatePath("/admin/magazine");
  revalidatePath("/magazine");
  return { ok: true };
}
