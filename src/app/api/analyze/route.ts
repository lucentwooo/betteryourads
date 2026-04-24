import { NextResponse } from "next/server";
import { createJob } from "@/lib/jobs/manager";
import { runFullAnalysis } from "@/lib/jobs/analyzer";
import type { AnalysisInput } from "@/lib/types";

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

    // Fire and forget -- analysis runs in background
    runFullAnalysis(job.id).catch((err) => {
      console.error(`Analysis failed for job ${job.id}:`, err);
    });

    return NextResponse.json({ jobId: job.id });
  } catch (error) {
    console.error("Failed to create analysis job:", error);
    return NextResponse.json(
      { error: "Failed to start analysis" },
      { status: 500 }
    );
  }
}
