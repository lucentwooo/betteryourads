import { NextResponse } from "next/server";
import { MOCK_JOB } from "@/lib/mock-data";

// Returns a mock live-progress job instantly -- no API calls, no scraping.
export async function POST(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("complete") === "1") {
    return NextResponse.json({ jobId: "mock-001" });
  }
  return NextResponse.json({ jobId: `mock-progress-${Date.now()}` });
}

export async function GET() {
  return NextResponse.json(MOCK_JOB);
}
