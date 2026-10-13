import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
];

const nextConfig: NextConfig = {
  output: "standalone", // small self-contained server for the Docker image
  experimental: {
    serverActions: { bodySizeLimit: "55mb" }, // report photos (5 × 10 MB), documents and invoices (20 MB)
    // The middleware sees every request; without this it cuts bodies off at 10 MB and large uploads fail.
    middlewareClientMaxBodySize: "55mb",
  },
  images: { unoptimized: true },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
