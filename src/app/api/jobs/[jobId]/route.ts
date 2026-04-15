import { NextResponse } from "next/server";
import { getJob } from "@/lib/jobs/manager";
import { MOCK_JOB } from "@/lib/mock-data";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  // Serve mock data for testing without API calls
  if (jobId === "mock-001") {
    return NextResponse.json(MOCK_JOB);
  }

  const job = await getJob(jobId);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Don't send raw diagnosis text in poll responses to keep payload small
  // Client gets the full data when status is "complete"
  return NextResponse.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    error: job.error,
    ...(job.status === "complete"
      ? {
          brandProfile: job.brandProfile,
          companyAds: job.companyAds,
          companyAdCount: job.companyAdCount,
          companyVideoCount: job.companyVideoCount,
          companyImageCount: job.companyImageCount,
          competitorData: job.competitorData,
          diagnosis: job.diagnosis,
          websiteScreenshot: job.websiteScreenshot,
          input: job.input,
        }
      : {}),
  });
}
