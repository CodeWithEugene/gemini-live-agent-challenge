import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        // Google Cloud Storage signed URLs
        protocol: "https",
        hostname: "storage.googleapis.com",
      },
      {
        // GCS bucket direct URLs
        protocol: "https",
        hostname: "*.storage.googleapis.com",
      },
    ],
  },
};

export default nextConfig;
