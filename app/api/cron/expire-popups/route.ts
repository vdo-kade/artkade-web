import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase-admin";
import { runPopupLifecycleTick } from "@/lib/popup-expiry";

// Vercel Cron hits this on a schedule (see vercel.json) with no session
// cookie at all -- it's outside /admin and /vendor on purpose so
// middleware's cookie-based role gate never gets in its way. Auth here is
// instead the shared-secret convention Vercel documents for cron routes:
// it attaches Authorization: Bearer $CRON_SECRET automatically when that
// env var is set on the project.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("CRON_SECRET is not set -- refusing to run the expiry check.");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runPopupLifecycleTick(createAdminClient());
  revalidatePath("/admin");
  revalidatePath("/");
  return NextResponse.json(result, { status: 200 });
}
