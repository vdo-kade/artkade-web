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
};

module.exports = nextConfig;
