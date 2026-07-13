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
        } catch {
          // Called from a Server Component render; safe to ignore since
          // this app has no auth session that needs refreshing.
        }
      },
    },
  });
}
