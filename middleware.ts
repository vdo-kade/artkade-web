import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase-env";

// The /admin/* and /vendor/* role gate: redirects to /admin/login unless
// the session's app_metadata.role grants access. (The site-wide password
// gate that used to run here too was removed now that Art Kade is public
// -- see app/gate/page.tsx, which just redirects to / now.)
//
// Applies a fix for a historical bug: a Server Action submission POSTs to
// the same page URL it lives on, carrying Next's own "Next-Action" header.
// A plain HTTP redirect on that request breaks the fetch-based Server
// Action protocol -- the client expects an action-response payload back,
// not a redirect to an unrelated page, so it fails silently instead of
// navigating anywhere (this is what made Save look unresponsive with a
// dead session, even though the action itself already redirects to
// /admin/login on a falsy getSessionRole() -- that in-action redirect
// never got a chance to run). So every Server Action request is let
// through untouched here -- each action can still enforce its own auth
// independently (see app/vendor/actions.ts and friends) the same way it
// already did before.
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isServerAction = request.headers.has("next-action");

  if (pathname === "/admin/login") {
    return NextResponse.next();
  }
  if (!pathname.startsWith("/admin") && !pathname.startsWith("/vendor")) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const { url, anonKey } = getSupabaseEnv();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[]
      ) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = user?.app_metadata?.role;
  const isAdmin = role === "admin";
  const isRestrictedAdmin = role === "restricted_admin";
  const isVendor = role === "vendor";

  // restricted_admin reads everywhere admin does (both /admin/* and
  // /vendor/*, the latter so it can browse any stall's dashboard) --
  // app/vendor/actions.ts and friends are what actually deny it write
  // access to catalogue/stall data, not this route gate.
  const allowed = pathname.startsWith("/vendor") ? isAdmin || isRestrictedAdmin || isVendor : isAdmin || isRestrictedAdmin;

  // Server Action carve-out (isServerAction is computed once, at the top
  // of this function, and reused here too).
  if (!allowed && !isServerAction) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  // A vendor or restricted_admin whose account still carries its original
  // TempPasswordReveal password (see app/admin/vendors/create/route.ts and
  // app/admin/staff/create/route.ts) can't reach anything else in
  // /admin/*/vendor/* until they set a real one -- enforced here rather
  // than just nudged from within the dashboard, because
  // app/vendor/page.tsx's DashboardTabs renders every tab's real data
  // server-side regardless of which tab is visually active, so a UI-only
  // nudge wouldn't actually withhold anything. Cleared by changePassword
  // in app/vendor/actions.ts.
  const mustChangePassword =
    (isVendor || isRestrictedAdmin) && user?.app_metadata?.must_change_password === true;
  if (mustChangePassword && pathname !== "/vendor/change-password" && !isServerAction) {
    return NextResponse.redirect(new URL("/vendor/change-password", request.url));
  }

  return response;
}

export const config = {
  // Runs on every route except: Next's own static/image asset pipeline,
  // the site's favicon files (app/icon.png, app/apple-icon.png,
  // favicon.ico), /api/* -- API routes aren't page navigations, and at
  // least one (the cron route) is deliberately called with no cookies at
  // all by Vercel's infrastructure, so running the admin/vendor auth check
  // here would silently break scheduled popup expiry (see
  // app/api/cron/expire-popups/route.ts's own comment about being outside
  // middleware's reach on purpose) -- and sitemap.xml/robots.txt
  // (app/sitemap.ts, app/robots.ts), which don't need it either.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|api/|sitemap.xml|robots.txt).*)"],
};
