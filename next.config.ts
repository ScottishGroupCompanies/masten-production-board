import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    // Staff who reach /users with a stale admin cookie get forbidden() from the page.
    authInterrupts: true,
    // Order PDFs can be multi-page scans. The app rejects anything over 20 MB;
    // leave a little room for the multipart wrapper around that file.
    serverActions: { bodySizeLimit: "21mb" },
    proxyClientMaxBodySize: "21mb",
  },
  serverExternalPackages: ["@libsql/client", "libsql"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
