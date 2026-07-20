/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        // EDIT: replace with your actual Supabase project ref once created,
        // e.g. abcdefghijk.supabase.co
        hostname: "*.supabase.co",
      },
    ],
    // Supabase's own Storage objects are served with Cache-Control:
    // no-cache regardless of the object's own cacheControl metadata (a
    // project/CDN-layer behavior, confirmed not fixable from the app side
    // -- verified by uploading a test file with an explicit long
    // cacheControl and seeing the served header still come back no-cache).
    // next/image's own optimizer route (/_next/image) is the fix in
    // practice: it fetches from Supabase once, then serves its *own*
    // Cache-Control on repeat requests, independent of the origin's
    // header. Default minimumCacheTTL is 3600s (1hr); raised to a week --
    // catalogue photos are edited occasionally (vendor "replace photo"),
    // not the kind of image that needs sub-hour freshness.
    minimumCacheTTL: 60 * 60 * 24 * 7,
  },
  experimental: {
    // Server Actions default to a 1MB request body limit -- fine for the
    // text-only actions in this app, but uploadStallPhoto (app/vendor/actions.ts)
    // sends a real photo file through a Server Action, and phone/camera
    // photos routinely exceed 1MB, so uploads were being rejected before
    // the action ever ran. Raised to cover realistic stall photo sizes.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  async headers() {
    // Next's own inline bootstrap/hydration scripts and this app's many
    // inline style={{...}} JSX props both need 'unsafe-inline' -- there's
    // no per-request nonce plumbed through middleware here, so a strict
    // nonce-based policy isn't realistic yet. 'unsafe-eval' is dev-only
    // (Fast Refresh needs it); production never gets it. img-src/connect-src
    // allow *.supabase.co for the Storage-hosted photos/freebies (see
    // next.config.js's own remotePatterns above) and the browser Supabase
    // client's own Auth/REST/Storage calls (see lib/supabase.ts).
    const isDev = process.env.NODE_ENV !== "production";
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://*.supabase.co",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          // Belt-and-suspenders with the CSP's frame-ancestors 'none' above --
          // frame-ancestors is the modern equivalent and takes precedence in
          // browsers that support both, but X-Frame-Options still matters for
          // any that don't.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
