import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Activity cover image uploads are capped at 5 MB per the bucket policy
      // (storage.buckets.amb_activities.file_size_limit). 6 MB leaves
      // headroom for multipart overhead + other form fields. Mirrors
      // primeengage/next.config.ts which sets the same limit for the
      // applicant Student ID upload.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
