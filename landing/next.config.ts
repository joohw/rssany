import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  output: "standalone",
  skipTrailingSlashRedirect: true,
  async redirects() {
    return [
      {
        source: "/",
        has: [{ type: "query", key: "lang", value: "en" }],
        destination: "/en",
        permanent: true,
      },
      {
        source: "/blog",
        has: [{ type: "query", key: "lang", value: "en" }],
        destination: "/en/blog",
        permanent: true,
      },
      {
        source: "/blog/:slug",
        has: [{ type: "query", key: "lang", value: "en" }],
        destination: "/en/blog/:slug",
        permanent: true,
      },
      { source: "/", destination: "/zh-CN", permanent: true },
      { source: "/blog", destination: "/zh-CN/blog", permanent: true },
      { source: "/blog/:slug", destination: "/zh-CN/blog/:slug", permanent: true },
      { source: "/about", destination: "/zh-CN", permanent: true },
      { source: "/docs", destination: "https://github.com/joohw/rssany#readme", permanent: false },
      { source: "/docs/:path*", destination: "https://github.com/joohw/rssany/tree/main/docs/:path*", permanent: false },
      { source: "/agents", destination: "/zh-CN", permanent: true },
      { source: "/agents/:path*", destination: "/zh-CN", permanent: true },
      { source: "/guides", destination: "/zh-CN", permanent: true },
      { source: "/guides/:path*", destination: "/zh-CN", permanent: true },
      { source: "/compare/:path*", destination: "/zh-CN", permanent: true },
      { source: "/dashboard", destination: "/zh-CN", permanent: true },
      { source: "/dashboard/:path*", destination: "/zh-CN", permanent: true },
    ];
  },
};

export default nextConfig;
