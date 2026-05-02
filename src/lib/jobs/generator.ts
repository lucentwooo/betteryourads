import path from "path";
import { getJob, updateJob, addProgress, setStatus, getJobDir } from "./manager";
import { runCopywriter } from "../agents/copywriter";
import { runArtDirector } from "../agents/art-director";
import { runImageGenerator } from "../agents/image-generator";
import { humanizeCopy } from "../agents/humanizer";
import { finalizeJobToSupabase } from "../persistence/finalize-job";
import { stitchBreakdowns, type AdPromptSeed } from "../style-engine/stitch";
import { validateBreakdown } from "../style-engine/schema";
import { createAdminClient } from "../supabase/admin";
import type { Creative, Concept } from "../types";

/**
 * Load the user's saved style references and stitch them into N seeds —
 * one per concept. Returns null if the user has no style refs (the art
 * director then falls back to the curated reference library).
 */
async function loadStyleSeeds(
  brandId: string | undefined,
  count: number,
): Promise<AdPromptSeed[] | null> {
  if (!brandId || count <= 0) return null;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("style_references")
      .select("breakdown")
      .eq("brand_id", brandId)
      .order("loved_at", { ascending: false })
      .limit(8);
    const rows = (data as Array<{ breakdown: unknown }> | null) ?? [];
    const breakdowns = rows
      .map((r) => validateBreakdown(r.breakdown))
      .filter((b): b is NonNullable<ReturnType<typeof validateBreakdown>> => !!b);
    if (breakdowns.length === 0) return null;
    return stitchBreakdowns(breakdowns, count);
  } catch (err) {
    console.error("[generator] loadStyleSeeds failed:", err);
    return null;
  }
}

/**
 * Creative production pipeline (Phases 4, 5, 6 of the agent workflow).
 * Runs Copywriter → Art Director → Image Generator for every APPROVED concept.
 * Each stage has its QA gate already. This orchestrator is thin.
 */

export async function runCreativeProduction(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) return;
  if (!job.concepts) {
    await addProgress(jobId, "Generation blocked", "No concepts to generate from");
    return;
  }

  const approved = job.concepts.filter((c) => c.approved === "approved");
  if (approved.length === 0) {
    await addProgress(jobId, "Generation blocked", "No approved concepts");
    return;
  }

  try {
    await setStatus(jobId, "copywriting");
    await addProgress(jobId, "Creative production starting", `${approved.length} approved concept(s)`);

    const jobDir = getJobDir(jobId);
    const creativesDir = path.join(jobDir, "creatives");

    // Load the user's saved style breakdowns and stitch one seed per
    // concept. When present, each concept gets a different structural DNA
    // so the generated set inherits visible variety from the loved refs.
    const styleSeeds = await loadStyleSeeds(job.input.brandId, approved.length);
    if (styleSeeds) {
      await addProgress(
        jobId,
        "Style guide loaded",
        `Stitched ${styleSeeds.length} seed${styleSeeds.length === 1 ? "" : "s"} from saved references`,
      );
    }

    const creatives: Creative[] = [];
    for (let i = 0; i < approved.length; i++) {
      const concept = approved[i];
      const creative = await produceOneCreative({
        jobId,
        concept,
        creativesDir,
        styleSeed: styleSeeds?.[i] ?? null,
      });
      creatives.push(creative);
      // Persist incrementally so the UI can show creatives as they land
      await updateJob(jobId, { creatives });
    }

    await setStatus(jobId, "complete");
    await addProgress(
      jobId,
      "Creatives ready",
      `${creatives.filter((c) => c.status === "complete").length}/${creatives.length} passed QA`,
    );

    // Persist the full job state to Supabase under the user's brand. Wrapped
    // so a Supabase outage never marks the job as errored — the user still
    // has their report from the existing Upstash flow.
    if (job.input.brandId) {
      try {
        await finalizeJobToSupabase(jobId, job.input.brandId);
      } catch (err) {
        console.error(`[finalize] Supabase write failed for ${jobId}:`, err);
        await addProgress(jobId, "Supabase sync failed", "Report still available — try again later");
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await addProgress(jobId, "Generation error", msg);
    await updateJob(jobId, { error: msg });
    await setStatus(jobId, "error");
  }
}

async function produceOneCreative(params: {
  jobId: string;
  concept: Concept;
  creativesDir: string;
  styleSeed: AdPromptSeed | null;
}): Promise<Creative> {
  const { jobId, concept, creativesDir, styleSeed } = params;
  const job = await getJob(jobId);
  if (!job) throw new Error("Job missing");

  const creativeId = `creative-${concept.id}`;
  const creative: Creative = {
    id: creativeId,
    conceptId: concept.id,
    register: "editorial",
    track: "B",
    copy: { primary: "", headline: "", description: "", cta: "", vocLanguageUsed: [] },
    retries: 0,
    status: "pending",
  };

  const progress = async (msg: string) => {
    await addProgress(jobId, "Creative production", msg, { agent: "creative-pipeline" });
  };

  // Copywriter
  await setStatus(jobId, "copywriting");
  const copy = await runCopywriter(
    {
      concept,
      voc: job.voc,
      brandProfile: job.brandProfile,
      companyName: job.input.companyName,
    },
    progress,
  );

  // Sonnet humanizer pass — polish into a sharp human voice. Falls back
  // to the cheap-stack copy if Sonnet errors or breaks char limits.
  await progress(`Humanizer polishing copy for "${concept.name}"`);
  creative.copy = await humanizeCopy(copy, concept.name);

  // Art Director
  await setStatus(jobId, "prompt-writing");
  const art = await runArtDirector(
    {
      concept,
      copy,
      brandProfile: job.brandProfile,
      companyName: job.input.companyName,
      styleSeed: styleSeed ?? undefined,
    },
    progress,
  );
  creative.register = art.register;
  creative.track = art.track;
  creative.prompt = art.prompt;
  creative.status = "generating";

  // Image Gen + Multimodal QA
  await setStatus(jobId, "image-generating");
  try {
    const { relativePath, qa } = await runImageGenerator(
      {
        creative,
        outputDir: creativesDir,
        brandProfile: job.brandProfile,
      },
      progress,
    );
    creative.imageUrl = `/api/creatives/${jobId}/${path.basename(relativePath)}`;
    creative.qa = { ...qa, retries: qa.retries };
    creative.status = qa.pass ? "complete" : "complete"; // keep for UI even if QA flagged
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    await progress(`Image gen failed for ${creative.id}: ${msg}`);
    creative.status = "failed";
    creative.qa = {
      pass: false,
      score: 0,
      issues: [msg],
      feedbackForRetry: msg,
      retries: 0,
    };
  }

  // Build the "Why this creative" trust panel from real refs
  const firstVocRef = job.voc?.snippets.find((s) =>
    concept.vocPatternRefs.some((ref) => {
      const allPatterns = [
        ...(job.voc?.painPoints ?? []),
        ...(job.voc?.desires ?? []),
        ...(job.voc?.objections ?? []),
        ...(job.voc?.languagePatterns ?? []),
      ];
      const p = allPatterns.find((x) => x.name === ref);
      return p && p.snippetRefs.includes(job.voc!.snippets.indexOf(s));
    }),
  );

  creative.whyThisCreative = {
    diagnosisFinding: concept.diagnosisFindingRef,
    vocPattern: firstVocRef
      ? {
          patternName: concept.vocPatternRefs[0] || "(none)",
          quote: firstVocRef.quote,
          source: firstVocRef.source,
          url: firstVocRef.url,
        }
      : {
          patternName: concept.vocPatternRefs[0] || "(none)",
          quote: "(no matching snippet found)",
          source: "other",
          url: "",
        },
    referenceAds: art.references.map((r) => r.key),
    frameworksApplied: [concept.framework],
  };

  return creative;
}
