import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { getJob } from "@/lib/jobs/manager";
import { runCreativeProduction } from "@/lib/jobs/generator";

export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const job = await getJob(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // Allow retriggering when the previous generation finished (complete) or
  // errored, so the user can re-run after fixing/retraining without being
  // stuck. Block only when a generation is actively in flight.
  const blockedStates = new Set([
    "queued",
    "scraping-website",
    "extracting-brand",
    "scraping-ads",
    "scraping-competitor-ads",
    "suggesting-competitors",
    "voc-research",
    "analyzing",
    "concept-architecting",
    "copywriting",
    "prompt-writing",
    "image-generating",
    "packaging",
  ]);
  if (blockedStates.has(job.status)) {
    return NextResponse.json(
      { error: `Job is ${job.status} — wait for the current run to finish` },
      { status: 409 },
    );
  }

  const approved = (job.concepts || []).filter((c) => c.approved === "approved");
  if (approved.length === 0) {
    return NextResponse.json({ error: "Approve at least one concept first" }, { status: 400 });
  }

  // waitUntil keeps the function alive past the response so the generator
  // actually runs on Vercel. Without it the function freezes immediately.
  waitUntil(
    runCreativeProduction(jobId).catch((err) => {
      console.error(`Creative production failed for job ${jobId}:`, err);
    })
  );

  return NextResponse.json({ started: true, approvedCount: approved.length });
}
