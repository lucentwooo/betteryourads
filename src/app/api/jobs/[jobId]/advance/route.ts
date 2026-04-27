import { NextResponse } from "next/server";
import { getJob } from "@/lib/jobs/manager";
import { runNextStage } from "@/lib/jobs/pipeline";
import { isMockProgressJob, makeMockProgressJob } from "@/lib/mock-data";

// Each /advance invocation runs exactly one pipeline stage synchronously.
// The browser calls this endpoint again after each stage. That avoids
// Vercel Preview deployment protection and long background waitUntil work
// becoming silent production-only stalls.
export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  if (isMockProgressJob(jobId)) {
    const job = makeMockProgressJob(jobId);
    const done = job.status === "complete";
    return NextResponse.json({
      advancing: !done,
      done,
      status: job.status,
    });
  }

  const result = await runNextStage(jobId);
  const job = await getJob(jobId);

  return NextResponse.json({
    advancing: !result.done,
    done: result.done,
    status: job?.status,
    error: job?.error,
  });
}
