import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { runStagesUntilBudget, triggerNextStage } from "@/lib/jobs/pipeline";

// Each /advance invocation runs exactly one pipeline stage, then fires
// another /advance for the next stage. This keeps each invocation under
// the 300s Hobby plan cap.
export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  waitUntil(
    (async () => {
      const result = await runStagesUntilBudget(jobId);
      if (result.handoff) {
        await triggerNextStage(jobId);
      }
    })().catch((err) => {
      console.error(`Pipeline stage failed for job ${jobId}:`, err);
    })
  );

  return NextResponse.json({ advancing: true });
}
