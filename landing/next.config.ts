import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  outputFileTracingRoot: path.join(__dirname, ".."),
  skipTrailingSlashRedirect: true,
  async redirects() {
    return [
      { source: "/about", destination: "/", permanent: true },
      { source: "/docs", destination: "https://github.com/joohw/rssany#readme", permanent: false },
      { source: "/docs/:path*", destination: "https://github.com/joohw/rssany/tree/main/docs/:path*", permanent: false },
      { source: "/agents", destination: "/", permanent: true },
      { source: "/agents/:path*", destination: "/", permanent: true },
      { source: "/guides", destination: "/", permanent: true },
      { source: "/guides/:path*", destination: "/", permanent: true },
      { source: "/compare/:path*", destination: "/", permanent: true },
      { source: "/dashboard", destination: "/", permanent: true },
      { source: "/dashboard/:path*", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
