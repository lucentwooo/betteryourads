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

  // Allow retriggering when the previous run finished (complete) or errored.
  // Block only when an upstream pipeline stage is still building the report,
  // OR when a creative-production stage has been active for less than the
  // stale-lock window (so one click doesn't spawn two parallel runs).
  // Stage stalls are common — Kie polling can hang, the QA loop can stall
  // — so we let the user override after STALE_LOCK_MS to recover.
  const STALE_LOCK_MS = 4 * 60 * 1000; // 4 minutes
  const upstreamBlocked = new Set([
    "queued",
    "scraping-website",
    "extracting-brand",
    "scraping-ads",
    "scraping-competitor-ads",
    "suggesting-competitors",
    "voc-research",
    "analyzing",
    "concept-architecting",
  ]);
  const creativeProduction = new Set([
    "copywriting",
    "prompt-writing",
    "image-generating",
    "packaging",
  ]);

  if (upstreamBlocked.has(job.status)) {
    return NextResponse.json(
      { error: `Diagnosis still running (${job.status}) — wait for the report to finish first` },
      { status: 409 },
    );
  }

  if (creativeProduction.has(job.status)) {
    const startedMs = job.stageRunningSince ? Date.parse(job.stageRunningSince) : NaN;
    const ageMs = Number.isFinite(startedMs) ? Date.now() - startedMs : Infinity;
    if (ageMs < STALE_LOCK_MS) {
      return NextResponse.json(
        {
          error: `Creatives are still rendering — they'll appear below in a moment. Try again in ${Math.max(
            5,
            Math.ceil((STALE_LOCK_MS - ageMs) / 1000),
          )}s if nothing shows up.`,
        },
        { status: 409 },
      );
    }
    // Lock is stale — let the user retry to recover from a hung run.
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
