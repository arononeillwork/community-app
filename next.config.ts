import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // small self-contained server for the Docker image
  experimental: {
    serverActions: { bodySizeLimit: "55mb" }, // report photos (5 × 10 MB)
  },
  images: { unoptimized: true },
};

export default nextConfig;
