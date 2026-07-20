import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/brand";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // /admin and /vendor are already behind their own auth (see
      // middleware.ts) -- disallowed here too so they're not offered as
      // crawlable links in the first place. /api is server-to-server
      // surface (checkout, uploads, cron), never a page meant to be
      // indexed.
      disallow: ["/admin", "/vendor", "/api"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
