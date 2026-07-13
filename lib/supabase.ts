import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./supabase-env";

// Client-side Supabase client (safe to use in "use client" components).
// Reads and public catalogue data go through this with Row Level Security
// (see supabase/schema.sql) controlling what an anonymous visitor can see.
export function createClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient(url, anonKey);
}
