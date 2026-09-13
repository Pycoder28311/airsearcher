import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // dev only: send stale /editor URLs left over from another local project to the home page
  async redirects() {
    if (process.env.NODE_ENV !== "development") return [];
    return [{ source: "/editor/:path*", destination: "/", permanent: false }];
  },
};

export default nextConfig;
