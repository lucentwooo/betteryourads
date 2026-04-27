import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ship the ad-library reference assets into serverless functions so the
  // runtime loader can read them via process.cwd().
  outputFileTracingIncludes: {
    // Reference assets — safe to ship everywhere, they're tiny.
    "/**/*": ["./src/lib/references/**/*"],
  },
  // chromium-min + puppeteer-core need to resolve from node_modules at
  // runtime. If Next.js bundles them, their dynamic lookups break.
  serverExternalPackages: ["@sparticuz/chromium-min", "puppeteer-core"],
};

export default nextConfig;
