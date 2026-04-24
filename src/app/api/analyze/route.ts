import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createJob } from "@/lib/jobs/manager";
import { triggerNextStage } from "@/lib/jobs/pipeline";
import type { AnalysisInput } from "@/lib/types";

// This route only creates the job and kicks off the first pipeline stage.
// The pipeline itself runs across multiple /advance invocations so each
// stage gets its own 300s budget (Hobby plan cap).
export const maxDuration = 60;

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
      triggerNextStage(job.id).catch((err) => {
        console.error(`Failed to kick off pipeline for ${job.id}:`, err);
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
