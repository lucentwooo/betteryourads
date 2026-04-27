import { NextResponse } from "next/server";
import { getJob, updateJob } from "@/lib/jobs/manager";
import { isMockProgressJob, makeMockProgressJob, MOCK_JOB } from "@/lib/mock-data";
import type { Concept } from "@/lib/types";

// Polled every 2s by the /analyze progress page. MUST NOT cache — a cached
// response freezes the UI on whatever status was cached at first poll.
// Next 16's default caching was the reason "Scanning site" appeared stuck.
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      "cache-control": "no-store, no-cache, must-revalidate",
      ...(init?.headers || {}),
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  if (jobId === "mock-001") {
    return noStore(MOCK_JOB);
  }
  if (isMockProgressJob(jobId)) {
    return noStore(makeMockProgressJob(jobId));
  }

  const job = await getJob(jobId);

  if (!job) {
    return noStore({ error: "Job not found" }, { status: 404 });
  }

  const revealFull = job.status === "complete" || job.status === "awaiting-approval";

  return noStore({
    id: job.id,
    status: job.status,
    progress: job.progress,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    error: job.error,
    ...(revealFull
      ? {
          brandProfile: job.brandProfile,
          companyAds: job.companyAds,
          companyAdCount: job.companyAdCount,
          companyVideoCount: job.companyVideoCount,
          companyImageCount: job.companyImageCount,
          competitorData: job.competitorData,
          diagnosis: job.diagnosis,
          voc: job.voc,
          concepts: job.concepts,
          creatives: job.creatives,
          websiteScreenshot: job.websiteScreenshot,
          input: job.input,
        }
      : {}),
  });
}

/**
 * PATCH — update concept approvals.
 * Body: { concepts: [{ id, approved, priority?, userEdits? }] }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const job = await getJob(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (!job.concepts) return NextResponse.json({ error: "No concepts to update" }, { status: 400 });

  const body = (await request.json()) as {
    concepts: Array<{ id: string; approved?: Concept["approved"]; priority?: number }>;
  };

  const byId = new Map(job.concepts.map((c) => [c.id, c]));
  for (const update of body.concepts || []) {
    const existing = byId.get(update.id);
    if (!existing) continue;
    if (update.approved) existing.approved = update.approved;
    if (typeof update.priority === "number") existing.priority = update.priority;
  }

  const updated = await updateJob(jobId, { concepts: [...byId.values()] });
  return NextResponse.json({ concepts: updated?.concepts ?? [] });
}
