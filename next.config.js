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
};

module.exports = nextConfig;
