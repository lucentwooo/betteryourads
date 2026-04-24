import { NextResponse } from "next/server";
import path from "path";
import JSZip from "jszip";
import { getJob } from "@/lib/jobs/manager";
import { fetchImage } from "@/lib/storage/image-store";
import type { Creative, Concept } from "@/lib/types";

/**
 * Exports the creative pack:
 *   - creatives/<stage>/<conceptName>.png
 *   - copy-sheet.md
 *   - copy-sheet.csv
 *   - voc-report.md
 *   - diagnosis.md
 *   - test-plan.md
 *   - README.md
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const job = await getJob(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const zip = new JSZip();
  const stem = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60);

  // 1. Creatives — add rendered PNGs
  const conceptById = new Map((job.concepts || []).map((c) => [c.id, c]));
  for (const creative of job.creatives || []) {
    const concept = conceptById.get(creative.conceptId);
    if (!creative.imageUrl) continue;
    try {
      const buf = await fetchImage(creative.imageUrl);
      const stage = concept?.awarenessStage ?? "unknown";
      const name = stem(concept?.name ?? creative.id);
      zip.file(`creatives/${stage}/${name}.png`, new Uint8Array(buf));
    } catch {
      // skip missing
    }
  }

  // 2. Copy sheet (Markdown + CSV)
  zip.file("copy-sheet.md", buildCopySheetMd(job.creatives || [], job.concepts || []));
  zip.file("copy-sheet.csv", buildCopySheetCsv(job.creatives || [], job.concepts || []));

  // 3. Diagnosis
  if (job.diagnosis) {
    zip.file("diagnosis.md", buildDiagnosisMd(job));
  }

  // 4. VoC report
  if (job.voc?.reportMd) {
    zip.file("voc-report.md", job.voc.reportMd);
  }

  // 5. Test plan
  if (job.diagnosis?.testPlan) {
    zip.file("test-plan.md", `# Test plan\n\n${job.diagnosis.testPlan}\n`);
  }

  // 6. README
  zip.file("README.md", buildReadme(job));

  const buf = await zip.generateAsync({ type: "nodebuffer" });
  const companySlug = stem(job.input.companyName);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="betteryourads-${companySlug}-${jobId}.zip"`,
    },
  });
}

function buildCopySheetMd(creatives: Creative[], concepts: Concept[]): string {
  const cById = new Map(concepts.map((c) => [c.id, c]));
  const lines: string[] = ["# Copy sheet", ""];
  for (const cr of creatives) {
    const concept = cById.get(cr.conceptId);
    lines.push(`## ${concept?.name ?? cr.id}`);
    lines.push(`- Stage: ${concept?.awarenessStage ?? "?"}`);
    lines.push(`- Framework: ${concept?.framework ?? "?"}`);
    lines.push(`- Register: ${cr.register} · Track: ${cr.track}`);
    lines.push(`- QA: ${cr.qa?.pass ? "pass" : "flagged"} (${cr.qa?.score ?? "?"})`);
    lines.push("");
    lines.push(`**Primary (${cr.copy.primary.length})**: ${cr.copy.primary}`);
    lines.push(`**Headline (${cr.copy.headline.length})**: ${cr.copy.headline}`);
    lines.push(`**Description (${cr.copy.description.length})**: ${cr.copy.description}`);
    lines.push(`**CTA**: ${cr.copy.cta}`);
    if (cr.copy.vocLanguageUsed.length > 0) {
      lines.push(`**VoC language used**: ${cr.copy.vocLanguageUsed.join(", ")}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function buildCopySheetCsv(creatives: Creative[], concepts: Concept[]): string {
  const cById = new Map(concepts.map((c) => [c.id, c]));
  const esc = (s: string) => `"${(s || "").replace(/"/g, '""').replace(/\n/g, " ")}"`;
  const header = "concept,stage,framework,register,track,qa_score,primary,headline,description,cta";
  const rows = creatives.map((cr) => {
    const concept = cById.get(cr.conceptId);
    return [
      esc(concept?.name ?? cr.id),
      esc(concept?.awarenessStage ?? ""),
      esc(concept?.framework ?? ""),
      esc(cr.register),
      esc(cr.track),
      String(cr.qa?.score ?? ""),
      esc(cr.copy.primary),
      esc(cr.copy.headline),
      esc(cr.copy.description),
      esc(cr.copy.cta),
    ].join(",");
  });
  return [header, ...rows].join("\n");
}

function buildDiagnosisMd(job: NonNullable<Awaited<ReturnType<typeof getJob>>>): string {
  const d = job.diagnosis!;
  return `# Diagnosis — ${job.input.companyName}

## TL;DR
${d.tldr}

## Executive summary
${d.executiveSummary}

## Doing well
${d.doingWell}

## Not working
${d.notWorking}

## Competitor wins
${d.competitorWins}

## Missing opportunities
${d.missingOpportunities}

## Awareness stage analysis
${d.awarenessStageAnalysis}

## Recommended concepts
${d.recommendedConcepts}

## Test plan
${d.testPlan}
`;
}

function buildReadme(job: NonNullable<Awaited<ReturnType<typeof getJob>>>): string {
  return `# BetterYourAds — ${job.input.companyName}

Generated ${job.completedAt ?? "(in progress)"}.

## What's in this pack
- creatives/ — rendered ad PNGs, organized by awareness stage
- copy-sheet.md / copy-sheet.csv — all copy variants
- diagnosis.md — the 8-area strategic diagnosis
- voc-report.md — Voice of Customer research
- test-plan.md — suggested test order

## How to ship
1. Upload PNGs as ad creatives in Meta Ads Manager.
2. Paste copy from copy-sheet.csv.
3. Follow test-plan.md for ordering.
`;
}
