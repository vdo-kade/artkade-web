import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { runTableBackup } from "@/lib/backup";

// Same shared-secret convention as the other cron routes (see
// app/api/cron/expire-popups/route.ts for the full reasoning) -- Vercel
// Cron attaches Authorization: Bearer $CRON_SECRET automatically, so only
// Vercel's own cron invoker (or someone who deliberately wants to trigger
// an extra backup, e.g. before a risky manual DB change) can hit this.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("CRON_SECRET is not set -- refusing to run the backup.");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runTableBackup(createAdminClient());
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error("Table backup failed:", err);
    return NextResponse.json({ error: "Backup failed" }, { status: 500 });
  }
}
