import { createClient } from "@supabase/supabase-js";

// Service-role client for server-only admin actions (order review/approval).
// Bypasses RLS entirely -- NEVER import this from a Client Component or
// anywhere its output could reach the browser bundle.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY -- required for admin actions."
    );
  }
  return createClient(url, serviceKey);
}
