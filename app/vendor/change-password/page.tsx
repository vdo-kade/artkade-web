import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/session-role";
import { logout } from "@/app/admin/actions";
import PasswordChangeForm from "../PasswordChangeForm";

export const revalidate = 0;

// The forced landing page for a vendor whose account still carries its
// original TempPasswordReveal-issued password (see
// app/admin/vendors/create/route.ts) -- middleware.ts redirects here
// before letting them reach anything else under /vendor/*. Deliberately
// minimal (no AdminNav, none of the real dashboard data DashboardTabs
// would otherwise render) so there's genuinely nothing to see here until
// the password is changed, not just a nudge that's easy to click past.
//
// Also reachable voluntarily by any vendor whose password is already
// real (e.g. bookmarked, or just wants to change it again) -- the copy
// below adapts to which case it is.
export default async function VendorChangePasswordPage() {
  const session = await getSessionRole();
  if (!session) redirect("/admin/login");
  if (session.role !== "vendor") redirect("/vendor");

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 420, margin: "60px auto" }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>
        {session.mustChangePassword ? "Set your password" : "Change your password"}
      </h1>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>
        {session.mustChangePassword
          ? "You're signed in with the temporary password from when your stall account was created. Set a real one to continue to your dashboard."
          : "Enter a new password below."}
      </p>
      <PasswordChangeForm redirectOnSuccess={session.mustChangePassword ? "/vendor" : undefined} />
      <form action={logout} style={{ marginTop: 24 }}>
        <button
          type="submit"
          style={{
            fontSize: 12,
            color: "#999",
            background: "none",
            border: "none",
            textDecoration: "underline",
            cursor: "pointer",
            padding: 0,
          }}
        >
          Log out
        </button>
      </form>
    </div>
  );
}
