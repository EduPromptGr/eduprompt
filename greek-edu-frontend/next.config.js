/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strict mode for better development experience
  reactStrictMode: true,

  // Disable powered by header
  poweredByHeader: false,

  // Image optimization — accept Supabase storage URLs
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },

  // Δεν χρειαζόμαστε transpile άλλων packages
  // (Supabase, Stripe κλπ. είναι ESM-ready)
}

module.exports = nextConfig
