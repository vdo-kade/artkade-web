import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { runPaymentProofCleanupTick } from "@/lib/payment-proof-cleanup";

// Same shared-secret convention as app/api/cron/expire-popups/route.ts
// (see that route's own comment for the full reasoning) -- Vercel Cron
// attaches Authorization: Bearer $CRON_SECRET automatically, so only
// Vercel's own cron invoker (not the public internet) can trigger this.
// Outside middleware's reach on purpose, same as expire-popups: this
// runs with no session cookie at all.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("CRON_SECRET is not set -- refusing to run the payment-proof cleanup.");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runPaymentProofCleanupTick(createAdminClient());
  return NextResponse.json(result, { status: 200 });
}
