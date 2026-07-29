import { getCachedUser } from "./supabase-server";

// A user's role/artist link lives entirely in Supabase Auth's
// app_metadata (the same place the original single admin flag lived --
// see middleware.ts) rather than a separate profiles table:
//   admin:            { role: "admin" }
//   restricted_admin: { role: "restricted_admin",
//                        must_change_password: true|undefined }
//   vendor:           { role: "vendor", artist_id: "<uuid of their artists row>",
//                        must_change_password: true|undefined }
// Set via the Auth Admin API when an account is created (see README).
// must_change_password is set true when a vendor or restricted_admin
// account is first created with a TempPasswordReveal-issued password (see
// app/admin/vendors/create/route.ts and app/admin/staff/create/route.ts)
// and cleared back to false once they successfully set a real one (see
// changePassword in app/vendor/actions.ts) -- middleware.ts is what
// actually enforces it, redirecting an account still carrying it to
// /vendor/change-password before anything else in the dashboard.
//
// restricted_admin sits between admin and vendor: it can view every
// stall/product/order (same read access as admin throughout /admin/* and
// /vendor/*) and fulfil orders (app/admin/orders/actions.ts treats it the
// same as admin), but every action in app/vendor/actions.ts that adds,
// edits, or deletes a stall/product/freebie -- plus vendor creation and
// deletion -- explicitly rejects it. It is never given an artistId: unlike
// a vendor it isn't scoped to one stall, and unlike admin it can't write
// to any of them.
export type SessionRole =
  | { role: "admin" }
  | { role: "restricted_admin"; mustChangePassword: boolean }
  | { role: "vendor"; artistId: string; mustChangePassword: boolean };

// Re-derives the caller's role from their session on every call rather
// than trusting anything the client submits -- Server Actions are POST
// endpoints in their own right, so each one needs its own authorization
// check, not just the page that renders their trigger form.
export async function getSessionRole(): Promise<SessionRole | null> {
  const {
    data: { user },
  } = await getCachedUser();

  const role = user?.app_metadata?.role;
  if (role === "admin") return { role: "admin" };
  if (role === "restricted_admin") {
    return {
      role: "restricted_admin",
      mustChangePassword: user?.app_metadata?.must_change_password === true,
    };
  }
  if (role === "vendor" && typeof user?.app_metadata?.artist_id === "string") {
    return {
      role: "vendor",
      artistId: user.app_metadata.artist_id,
      mustChangePassword: user.app_metadata?.must_change_password === true,
    };
  }
  return null;
}
