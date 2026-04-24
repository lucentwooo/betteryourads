import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createJob } from "@/lib/jobs/manager";
import { runFullAnalysis } from "@/lib/jobs/analyzer";
import type { AnalysisInput } from "@/lib/types";

// Vercel freezes the function the instant the response is sent. waitUntil
// keeps it alive for up to maxDuration so the pipeline actually runs.
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

    // Ensure URL has protocol
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

    // waitUntil tells Vercel to keep the function alive until this promise
    // settles. Without it, the analysis would be killed the moment we send
    // the response below.
    waitUntil(
      runFullAnalysis(job.id).catch((err) => {
        console.error(`Analysis failed for job ${job.id}:`, err);
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
