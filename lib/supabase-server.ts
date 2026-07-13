import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server Component / route handler Supabase client. Reads go through the
// anon key with Row Level Security enforcing that only active/published
// catalogue data is visible (see supabase/schema.sql).
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
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
    }
  );
}
