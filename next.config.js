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
