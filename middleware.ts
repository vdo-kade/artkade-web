import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase-env";

// Gatekeeper for every /admin/* and /vendor/* route (matcher below).
// /admin/login is the only exception -- everything else redirects to it
// unless the request carries a session for a user whose app_metadata.role
// grants access: "admin" for /admin/*, and "admin" or "vendor" for
// /vendor/* (a vendor manages their own artist row there; admin can manage
// any stall from the same dashboard -- see lib/session-role.ts).
export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/admin/login") {
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
  const isVendor = role === "vendor";

  const allowed = request.nextUrl.pathname.startsWith("/vendor")
    ? isAdmin || isVendor
    : isAdmin;

  // A Server Action submission POSTs to the same page URL it lives on, so it
  // matches this same matcher -- this request carries Next's own
  // "Next-Action" header identifying which action to run. Redirecting it
  // here (a plain HTTP redirect) instead of letting the request reach that
  // action breaks the fetch-based action protocol: the client expects an
  // action-response payload back, not a redirect to an unrelated page, so it
  // fails silently instead of navigating anywhere (this is what made Save
  // look unresponsive with a dead session, even though every action already
  // redirects to /admin/login itself on a falsy getSessionRole() -- that
  // in-action redirect never got a chance to run). Every action re-derives
  // the session and redirects on its own, so it's safe to just let these
  // requests through and leave the auth decision to the action.
  const isServerAction = request.headers.has("next-action");

  if (!allowed && !isServerAction) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/vendor/:path*"],
};
