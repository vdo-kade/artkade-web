import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getSessionRole } from "@/lib/session-role";
import { genTempPassword } from "@/lib/gen-password";

// Deliberately placed under /admin/* (not /api/admin/*) so
// middleware.ts's existing /admin/:path* matcher gates this route for
// free -- see app/admin/vendors/create/route.ts's identical comment. Still
// re-derives getSessionRole() itself below and requires the *full* admin
// role specifically (not restricted_admin) -- creating a login is exactly
// the kind of account-structure change restricted_admin doesn't get, same
// as it can't create or delete a vendor.
export async function POST(req: NextRequest) {
  const session = await getSessionRole();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const formData = await req.formData();
  const email = formData.get("email");
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const tempPassword = genTempPassword();
    const { error: userError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      // must_change_password: forces a password change before anything
      // else in the dashboard (see middleware.ts) -- cleared by
      // changePassword in app/vendor/actions.ts once they set a real one.
      // No artist_id: unlike a vendor, restricted_admin isn't scoped to
      // one stall (see lib/session-role.ts).
      app_metadata: { role: "restricted_admin", must_change_password: true },
    });
    if (userError) {
      console.error("Failed to create restricted admin auth user:", userError);
      const message = userError.message?.includes("already")
        ? "That email is already in use by another account."
        : "Failed to create the account.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ email, tempPassword }, { status: 201 });
  } catch (err) {
    console.error("Restricted admin creation threw:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
