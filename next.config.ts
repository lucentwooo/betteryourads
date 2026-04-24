import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ship the ad-library reference assets into serverless functions so the
  // runtime loader can read them via process.cwd().
  outputFileTracingIncludes: {
    // Reference assets — safe to ship everywhere, they're tiny.
    "/**/*": ["./src/lib/references/**/*"],
    // @sparticuz/chromium ships a ~60MB Chrome binary. Only bundle it into
    // the routes that actually launch puppeteer, otherwise every function
    // explodes past Vercel's 250MB limit.
    "/api/suggest-competitors": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/analyze": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
  // @sparticuz/chromium ships a prebuilt Chrome binary and needs to locate
  // it at runtime via its own package path. If Next.js bundles it, the
  // binary lookup breaks. Keep it (and puppeteer-core) as external modules.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
};

export default nextConfig;
