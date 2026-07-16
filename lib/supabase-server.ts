import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { getSupabaseEnv } from "./supabase-env";

// Server Component / route handler Supabase client. Reads go through the
// anon key with Row Level Security enforcing that only active/published
// catalogue data is visible (see supabase/schema.sql).
export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[]
      ) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch (err) {
          // Next.js only allows cookies() writes from a Server Action or
          // Route Handler, not a Server Component render -- so this throws
          // on every plain page render that happens to need a token
          // refresh. middleware.ts is what actually keeps the session
          // cookie fresh in that case (it runs first on every /admin/* and
          // /vendor/* request and can write cookies). This catch exists so
          // that expected case doesn't crash the render; log it so a
          // genuine persist failure (e.g. inside a Server Action, where it
          // should never happen) doesn't go unnoticed and quietly kill the
          // session -- see app/vendor/actions.ts's redirect-to-login on a
          // dead session.
          console.error("Failed to persist refreshed Supabase session cookie:", err);
        }
      },
    },
  });
}

// getUser() re-derives the session from cookies and, if the access token is
// expired, refreshes it -- which the setAll catch above shows can't persist
// from a Server Component render. Every consumer used to call this
// independently (getSessionRole(), plus a separate explicit call in a
// couple of pages just to display the user's email), so a single expired
// token could trigger several independent refresh attempts within the same
// request. Supabase's refresh tokens are single-use and rotate on refresh,
// so the second attempt reuses a token the first already burned and fails
// outright -- not a transient "expired" state but a dead one, which is why
// it took a fresh sign-in (not just a page refresh) to recover. cache()
// dedupes all of that down to one real call per request/action.
export const getCachedUser = cache(async () => {
  const supabase = await createClient();
  return supabase.auth.getUser();
});
