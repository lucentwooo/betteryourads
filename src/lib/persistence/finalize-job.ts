/**
 * After the pipeline completes, copy the job's voc quotes, competitor ads,
 * diagnosis, and concepts into Supabase under the user's brand. The brand
 * row + reports row are already created at /api/analyze entry — this fills
 * in the dependent tables once the data exists.
 *
 * Wrapped in try/catch by callers so a Supabase write failure never kills
 * the pipeline (the user still gets their report from Upstash).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getJob } from "@/lib/jobs/manager";

export async function finalizeJobToSupabase(
  jobId: string,
  brandId: string,
): Promise<void> {
  const job = await getJob(jobId);
  if (!job) return;
  const admin = createAdminClient();

  // Backfill brand with extracted colors/fonts/logo (the website scraper
  // produces these mid-pipeline; we don't have them at /api/analyze entry).
  if (job.brandProfile) {
    await admin
      .from("brands")
      .update({
        colors: job.brandProfile.colors ?? null,
        fonts: job.brandProfile.typography ?? null,
        logo_url: job.brandProfile.logoUrl ?? null,
      })
      .eq("id", brandId);
  }

  // VoC quotes — VoiceOfCustomer.snippets is the canonical source list.
  if (job.voc?.snippets?.length) {
    const rows = job.voc.snippets.slice(0, 200).map((q) => ({
      brand_id: brandId,
      quote: q.quote,
      source: q.source,
      source_label: q.sourceLabel ?? null,
      url: q.url ?? null,
      signal_score: typeof q.signalScore === "number" ? q.signalScore : null,
      metadata: q.metadata ?? null,
    }));
    await admin.from("voc_quotes").insert(rows);
  }

  // Competitor ads (cap at 200 rows total)
  if (job.competitorData?.length) {
    type CompetitorAdRow = {
      brand_id: string;
      competitor_name: string;
      image_url: string;
      copy_text: string | null;
      ad_type: "image" | "video";
      source_page_id: string | null;
    };
    const rows: CompetitorAdRow[] = [];
    for (const c of job.competitorData) {
      for (const ad of c.ads ?? []) {
        if (!ad.screenshotPath) continue;
        rows.push({
          brand_id: brandId,
          competitor_name: c.name,
          image_url: ad.screenshotPath,
          copy_text: ad.copyText || null,
          ad_type: ad.adType === "video" ? "video" : "image",
          source_page_id: null,
        });
        if (rows.length >= 200) break;
      }
      if (rows.length >= 200) break;
    }
    if (rows.length) await admin.from("competitor_ads").insert(rows);
  }

  // Reports row already exists (created at /api/analyze) — fill in the
  // diagnosis + concepts once they're produced.
  await admin
    .from("reports")
    .update({
      diagnosis: job.diagnosis ?? null,
      concepts: job.concepts ?? null,
    })
    .eq("job_id", jobId);
}
