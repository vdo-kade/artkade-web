import { createBrowserClient } from "@supabase/ssr";

// Client-side Supabase client (safe to use in "use client" components).
// Reads and public catalogue data go through this with Row Level Security
// (see supabase/schema.sql) controlling what an anonymous visitor can see.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
