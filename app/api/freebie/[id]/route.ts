import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

// Egress mitigation, same idea as next.config.js's minimumCacheTTL for
// next/image (see docs/free-tier-checklist.md): Supabase Storage serves
// every object with Cache-Control: no-cache regardless of the object's
// own metadata, confirmed not fixable from the app side. next/image works
// around that by fetching the original once and serving its own
// Cache-Control on repeats -- but that only covers images rendered
// through <Image>, and freebie files are ringtones/PDFs/the full-size
// wallpaper download, not all of which next/image can even handle. This
// route is the same fix applied to those: fetch from Storage once, then
// let Vercel's edge cache the response under a long max-age so every
// repeat download of the same freebie never reaches Supabase again.
//
// Safe to cache this aggressively because freebies are never edited in
// place -- updateFreebie (app/vendor/actions.ts) only ever touches title/
// description/category text fields, and a replacement file would need a
// new freebie row entirely (there's no "replace file" action), so the
// bytes behind a given id are immutable for the row's lifetime.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: freebie } = await supabase
    .from("freebies")
    .select("file_url")
    .eq("id", params.id)
    .maybeSingle();
  if (!freebie) return new NextResponse("Not found", { status: 404 });

  const upstream = await fetch(freebie.file_url);
  if (!upstream.ok || !upstream.body) {
    return new NextResponse("Failed to fetch file", { status: 502 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
