import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ship the ad-library reference assets into serverless functions so the
  // runtime loader can read them via process.cwd().
  outputFileTracingIncludes: {
    "/**/*": [
      "./src/lib/references/**/*",
    ],
  },
};

export default nextConfig;
