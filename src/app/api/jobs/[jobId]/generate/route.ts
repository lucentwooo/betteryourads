import { NextResponse } from "next/server";
import { getJob } from "@/lib/jobs/manager";
import { runCreativeProduction } from "@/lib/jobs/generator";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const job = await getJob(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  if (job.status !== "awaiting-approval") {
    return NextResponse.json(
      { error: `Job in state "${job.status}" — can't generate` },
      { status: 400 },
    );
  }

  const approved = (job.concepts || []).filter((c) => c.approved === "approved");
  if (approved.length === 0) {
    return NextResponse.json({ error: "Approve at least one concept first" }, { status: 400 });
  }

  // Fire-and-forget — the UI polls /api/jobs/[jobId] for progress
  runCreativeProduction(jobId).catch((err) => {
    console.error(`Creative production failed for job ${jobId}:`, err);
  });

  return NextResponse.json({ started: true, approvedCount: approved.length });
}
