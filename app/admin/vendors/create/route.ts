import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase-admin";
import { getSessionRole } from "@/lib/session-role";
import { slugify } from "@/lib/slugify";
import { genTempPassword } from "@/lib/gen-password";
import { uploadStallPhotoFile } from "@/lib/storage";

// Deliberately placed under /admin/* (not /api/admin/*) so
// middleware.ts's existing /admin/:path* matcher gates this route for
// free -- an /api/admin/... path would NOT be covered by that matcher.
// Still re-derives getSessionRole() itself below, matching this codebase's
// house rule that every privileged write checks its own auth regardless of
// what gates it. A Route Handler rather than a Server Action because two
// file uploads in one submission are more likely to bump into the 10mb
// Server Action body limit than the existing single-file uploadStallPhoto
// -- same reasoning as app/api/upload-payment-proof/route.ts.
export async function POST(req: NextRequest) {
  const session = await getSessionRole();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const formData = await req.formData();
  const name = formData.get("name");
  const tagline = formData.get("tagline");
  const bio = formData.get("bio");
  const email = formData.get("email");
  const logo = formData.get("logo");
  const hero = formData.get("hero");
  const popupStartsAtRaw = formData.get("popupStartsAt");
  const popupEndsAtRaw = formData.get("popupEndsAt");

  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  // <input type="datetime-local"> submits local-time strings with no
  // timezone, same interpretation as app/vendor/actions.ts.
  const popupStartsAt =
    typeof popupStartsAtRaw === "string" && popupStartsAtRaw
      ? new Date(popupStartsAtRaw).toISOString()
      : null;
  const popupEndsAt =
    typeof popupEndsAtRaw === "string" && popupEndsAtRaw
      ? new Date(popupEndsAtRaw).toISOString()
      : null;
  // A real scheduled window: invisible to customers until the start date
  // arrives (lib/popup-expiry.ts's runPopupLifecycleTick then flips this on
  // when it's due, and off again once popup_ends_at passes).
  const isActive = !(popupStartsAt && new Date(popupStartsAt) > new Date());

  try {
    const supabase = createAdminClient();

    const baseSlug = slugify(name);
    let slug = baseSlug;
    for (let attempt = 2; ; attempt++) {
      const { data: existing } = await supabase.from("artists").select("id").eq("slug", slug).maybeSingle();
      if (!existing) break;
      slug = `${baseSlug}-${attempt}`;
    }

    const { count } = await supabase.from("artists").select("id", { count: "exact", head: true });

    const { data: artist, error: insertError } = await supabase
      .from("artists")
      .insert({
        slug,
        name: name.trim(),
        tagline: typeof tagline === "string" && tagline.trim() ? tagline.trim() : null,
        bio: typeof bio === "string" && bio.trim() ? bio.trim() : null,
        is_popup: true,
        is_active: isActive,
        popup_starts_at: popupStartsAt,
        popup_ends_at: popupEndsAt,
        sort_order: count ?? 0,
      })
      .select("id, slug")
      .single();
    if (insertError || !artist) {
      console.error("Failed to create pop-up vendor artist row:", insertError);
      return NextResponse.json({ error: "Failed to create the stall." }, { status: 500 });
    }

    const photoUpdates: Record<string, string> = {};
    if (logo instanceof File && logo.size > 0) {
      const url = await uploadStallPhotoFile(supabase, artist.slug, "logo_url", logo);
      if (url) photoUpdates.logo_url = url;
    }
    if (hero instanceof File && hero.size > 0) {
      const url = await uploadStallPhotoFile(supabase, artist.slug, "hero_image_url", hero);
      if (url) photoUpdates.hero_image_url = url;
    }
    if (Object.keys(photoUpdates).length > 0) {
      await supabase.from("artists").update(photoUpdates).eq("id", artist.id);
    }

    const tempPassword = genTempPassword();
    const { error: userError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      // must_change_password: forces a password change before anything
      // else in the dashboard (see middleware.ts) -- cleared by
      // changePassword in app/vendor/actions.ts once they set a real one.
      app_metadata: { role: "vendor", artist_id: artist.id, must_change_password: true },
    });
    if (userError) {
      // No orphaned empty stall from a failed signup (e.g. duplicate email).
      await supabase.from("artists").delete().eq("id", artist.id);
      console.error("Failed to create vendor auth user:", userError);
      const message = userError.message?.includes("already")
        ? "That email is already in use by another account."
        : "Failed to create the vendor's login.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    revalidatePath("/admin");
    return NextResponse.json({ slug: artist.slug, email, tempPassword }, { status: 201 });
  } catch (err) {
    console.error("Pop-up vendor creation threw:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
