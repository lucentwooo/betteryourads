import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createJob } from "@/lib/jobs/manager";
import { runStagesUntilBudget, triggerNextStage } from "@/lib/jobs/pipeline";
import type { AnalysisInput } from "@/lib/types";

// This route creates the job, then runs the pipeline stages inline until
// it's about to hit the 300s Hobby cap. If the pipeline isn't finished by
// then, it hands off to /api/jobs/[id]/advance for another 300s of
// budget. Running inline (rather than HTTP-hopping to /advance for the
// first batch) avoids Vercel Preview deployment protection issues on the
// first handoff.
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { companyName, companyUrl, competitors, ...rest } = body;

    if (!companyName || !companyUrl) {
      return NextResponse.json(
        { error: "Company name and URL are required" },
        { status: 400 }
      );
    }

    const url = companyUrl.startsWith("http")
      ? companyUrl
      : `https://${companyUrl}`;

    const input: AnalysisInput = {
      companyName,
      companyUrl: url,
      competitors: competitors || [],
      ...rest,
    };

    const job = await createJob(input);

    waitUntil(
      (async () => {
        const result = await runStagesUntilBudget(job.id);
        if (result.handoff) {
          await triggerNextStage(job.id);
        }
      })().catch((err) => {
        console.error(`Pipeline failed for ${job.id}:`, err);
      })
    );

    return NextResponse.json({ jobId: job.id });
  } catch (error) {
    console.error("Failed to create analysis job:", error);
    return NextResponse.json(
      { error: "Failed to start analysis" },
      { status: 500 }
    );
  }
}
