import { NextResponse } from "next/server";

export const dynamic = "force-static";
export const revalidate = false;

// Build-time captured commit SHA. Lets the test harness confirm a
// preview deployment matches the SHA we just pushed before running
// scrape tests against it.
const SHA =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  "unknown";

export async function GET() {
  return NextResponse.json({
    sha: SHA,
    builtAt: process.env.VERCEL_DEPLOYMENT_ID || "local",
  });
}
