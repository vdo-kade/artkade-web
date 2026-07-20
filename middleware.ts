import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase-env";
import { GATE_COOKIE_NAME, GATE_PATH, getExpectedGateCookieValue } from "@/lib/gate";

// Two independent gates share this one middleware, checked in order:
//
// 1. Site-wide password gate (every route via the matcher below, minus
//    _next/static, _next/image, favicons, and /api/* -- see the matcher
//    comment for why /api is excluded). Redirects to /gate if the request
//    carries no valid gate cookie.
// 2. The existing /admin/* and /vendor/* role gate, unchanged: redirects
//    to /admin/login unless the session's app_metadata.role grants access.
//
// Both apply the SAME fix for the same historical bug: a Server Action
// submission POSTs to the same page URL it lives on, carrying Next's own
// "Next-Action" header. A plain HTTP redirect on that request breaks the
// fetch-based Server Action protocol -- the client expects an action-
// response payload back, not a redirect to an unrelated page, so it fails
// silently instead of navigating anywhere (this is what made Save look
// unresponsive with a dead session, even though the action itself already
// redirects to /admin/login on a falsy getSessionRole() -- that in-action
// redirect never got a chance to run). So every Server Action request is
// let through untouched here, on the assumption that reaching the page
// that action lives on already required passing whichever gate applies to
// it -- each action can still enforce its own auth independently (see
// app/vendor/actions.ts and friends) the same way it already did before
// this gate existed.
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isServerAction = request.headers.has("next-action");

  if (pathname !== GATE_PATH && !isServerAction) {
    const expectedGateCookie = await getExpectedGateCookieValue();
    const actualGateCookie = request.cookies.get(GATE_COOKIE_NAME)?.value;
    if (!expectedGateCookie || actualGateCookie !== expectedGateCookie) {
      return NextResponse.redirect(new URL(GATE_PATH, request.url));
    }
  }

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
  const isVendor = role === "vendor";

  const allowed = pathname.startsWith("/vendor") ? isAdmin || isVendor : isAdmin;

  // Same Server Action carve-out as the site gate above (isServerAction is
  // computed once, at the top of this function, and reused here).
  if (!allowed && !isServerAction) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  return response;
}

export const config = {
  // Runs on every route except: Next's own static/image asset pipeline,
  // the site's favicon files (app/icon.png, app/apple-icon.png,
  // favicon.ico), /api/* -- API routes aren't page navigations, and at
  // least one (the cron route) is deliberately called with no cookies at
  // all by Vercel's infrastructure, so gating it here would silently break
  // scheduled popup expiry (see app/api/cron/expire-popups/route.ts's own
  // comment about being outside middleware's reach on purpose) -- and
  // sitemap.xml/robots.txt (app/sitemap.ts, app/robots.ts), which search
  // crawlers request with no gate cookie at all; redirecting those to
  // /gate would serve an HTML login page in place of the real XML/text,
  // breaking indexing entirely rather than just being inconvenient.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|api/|sitemap.xml|robots.txt).*)"],
};
