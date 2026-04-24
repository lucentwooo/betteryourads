import { NextResponse } from "next/server";
import { createJob } from "@/lib/jobs/manager";
import type { AnalysisInput } from "@/lib/types";

export const maxDuration = 30;

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

    return NextResponse.json({ jobId: job.id });
  } catch (error) {
    console.error("Failed to create analysis job:", error);
    return NextResponse.json(
      { error: "Failed to start analysis" },
      { status: 500 }
    );
  }
}
