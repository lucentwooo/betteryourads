import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ship reference assets (ad library + configs) with the Vercel deploy so
  // the runtime loader can read them via process.cwd() in serverless functions.
  outputFileTracingIncludes: {
    "/**/*": [
      "./src/lib/references/**/*",
    ],
  },
};

export default nextConfig;
