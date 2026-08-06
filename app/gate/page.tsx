import { redirect } from "next/navigation";

// Art Kade is public now -- the password gate that used to live here is
// gone (see middleware.ts, which no longer checks for it). This route
// stays only so old links/bookmarks to /gate land somewhere real instead
// of 404ing. Forced dynamic: statically prerendering a page whose only
// job is redirect() bakes a client-side/meta-refresh redirect with no
// Location header instead of a real HTTP redirect (confirmed against a
// production build) -- crawlers and curl need the real 307.
export const dynamic = "force-dynamic";

export default function GatePage() {
  redirect("/");
}
