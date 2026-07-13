// Fails fast with a clear message instead of letting supabase-js throw
// "Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL" -- which gives no
// hint that the actual cause is a missing/unset env var (usually because
// NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY aren't configured
// in the deployment environment, e.g. Vercel Project Settings -> Environment
// Variables).
export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    const missing = [
      !url && "NEXT_PUBLIC_SUPABASE_URL",
      !anonKey && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]
      .filter(Boolean)
      .join(", ");
    throw new Error(
      `Missing required env var(s): ${missing}. Set them in .env.local for ` +
        `local dev, or in your deployment platform's environment variable ` +
        `settings (e.g. Vercel Project Settings -> Environment Variables) ` +
        `and redeploy -- NEXT_PUBLIC_ vars are baked in at build time, so ` +
        `adding them after a build won't take effect until you redeploy.`
    );
  }

  return { url, anonKey };
}
