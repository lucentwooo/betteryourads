import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { addProgress, createJob, setStatus } from "@/lib/jobs/manager";
import { runNextStage } from "@/lib/jobs/pipeline";
import type { AnalysisInput } from "@/lib/types";

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
    await setStatus(job.id, "scraping-website");
    await addProgress(
      job.id,
      "Scanning website",
      "Starting deployed scanner..."
    );
    waitUntil(
      runNextStage(job.id).catch(async (err) => {
        const msg = err instanceof Error ? err.message : "Pipeline failed";
        console.error(`Initial pipeline stage failed for ${job.id}:`, err);
        await setStatus(job.id, "error");
        await addProgress(job.id, "Error", msg);
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
