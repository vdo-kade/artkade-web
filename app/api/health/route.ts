import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/supabase-env";

// Meant to be hit on a schedule by a free external uptime pinger
// (UptimeRobot, Better Uptime, etc) -- deliberately public, no auth, no
// rate limit, since that's the whole point of a health check. Confirms
// the DB is actually reachable, not just that the Next.js process is up:
// a healthy server process sitting in front of a dead DB connection would
// otherwise look "fine" to a pinger that only checks the app responds at
// all.
//
// Excluded from the site-wide password gate for free -- middleware.ts's
// matcher already carves out all of /api/*.
export const dynamic = "force-dynamic";

export async function GET() {
  const start = Date.now();
  try {
    const { url, anonKey } = getSupabaseEnv();
    const supabase = createClient(url, anonKey);

    // head: true -- no row data transferred, just the cheapest possible
    // real round-trip to Postgres through RLS (same anon-key/RLS path
    // every public page already depends on).
    const { error } = await supabase.from("artists").select("id", { count: "exact", head: true });
    if (error) throw error;

    return NextResponse.json(
      { status: "ok", db: "reachable", latencyMs: Date.now() - start },
      { status: 200 }
    );
  } catch (err) {
    // Never forward raw error text to the client -- same reasoning as
    // every other route in this app (see
    // app/api/upload-payment-proof/route.ts): internal client-library
    // errors can embed sensitive values. Log full detail server-side,
    // where Vercel's function logs are enough to see what actually broke.
    console.error("Health check failed:", err);
    return NextResponse.json({ status: "error", db: "unreachable" }, { status: 503 });
  }
}
