import path from "path";
import { getJob, updateJob, addProgress, setStatus, getJobDir } from "./manager";
import { runCopywriter } from "../agents/copywriter";
import { runArtDirector } from "../agents/art-director";
import { runImageGenerator } from "../agents/image-generator";
import { humanizeCopy } from "../agents/humanizer";
import { finalizeJobToSupabase } from "../persistence/finalize-job";
import { createAdminClient } from "../supabase/admin";
import type { Creative, Concept } from "../types";

/**
 * Resolve the brand's business_type from the job (preferred — set by
 * /api/analyze on submit) or, as a fallback, by reading the brands row.
 * Threaded through to the art director so prompt writing filters every
 * prop / subject / setting through the brand's actual product domain.
 */
async function resolveBusinessType(
  jobInputType: string | undefined,
  brandId: string | undefined,
): Promise<string | undefined> {
  if (jobInputType) return jobInputType;
  if (!brandId) return undefined;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("brands")
      .select("business_type")
      .eq("id", brandId)
      .maybeSingle();
    const bt = (data as { business_type?: string | null } | null)?.business_type;
    return bt || undefined;
  } catch (err) {
    console.error("[generator] resolveBusinessType failed:", err);
    return undefined;
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

    // Load business_type once so the art director can scope prop and subject
    // choices to the brand's product domain.
    const businessType = await resolveBusinessType(
      job.input.businessType,
      job.input.brandId,
    );

    const creatives: Creative[] = [];
    for (let i = 0; i < approved.length; i++) {
      const concept = approved[i];
      const creative = await produceOneCreative({
        jobId,
        concept,
        creativesDir,
        businessType,
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
  businessType?: string;
}): Promise<Creative> {
  const { jobId, concept, creativesDir, businessType } = params;
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
      businessType,
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
    // Log to Vercel runtime so the full error (incl. stack) is grep-able
    // even after the job state is summarised down to a one-line message.
    console.error(`[image-gen] ${creative.id} threw:`, err);
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
