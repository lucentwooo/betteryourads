import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ship the ad-library reference assets into serverless functions so the
  // runtime loader can read them via process.cwd().
  outputFileTracingIncludes: {
    "/**/*": [
      "./src/lib/references/**/*",
    ],
  },
  // @sparticuz/chromium ships a prebuilt Chrome binary and needs to locate
  // it at runtime via its own package path. If Next.js bundles it, the
  // binary lookup breaks. Keep it (and puppeteer-core) as external modules.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
};

export default nextConfig;
