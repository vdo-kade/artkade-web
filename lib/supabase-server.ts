import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
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
