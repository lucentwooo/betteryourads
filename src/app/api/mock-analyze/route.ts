import { NextResponse } from "next/server";
import { MOCK_JOB } from "@/lib/mock-data";

// Returns a mock completed job instantly -- no API calls, no scraping
export async function POST() {
  return NextResponse.json({ jobId: "mock-001" });
}

export async function GET() {
  return NextResponse.json(MOCK_JOB);
}
