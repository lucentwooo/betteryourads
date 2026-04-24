import path from "path";
import { getJob, updateJob, addProgress, setStatus, getJobDir } from "./manager";
import { upsertBrandFromJob } from "../brands/manager";
import { scrapeWebsite } from "../scraper/website-scraper";
import { extractBrandFromPage } from "../scraper/brand-extractor";
import {
  extractBrandColorsFromScreenshot,
  paletteLooksBroken,
} from "../ai/brand-vision";
import { scrapeMetaAdLibrary } from "../scraper/meta-ad-scraper";
import { generateBrandDosAndDonts } from "../ai/diagnosis";
import { runResearcher } from "../agents/researcher";
import { runStrategist } from "../agents/strategist";
import { runCreativeDirector } from "../agents/creative-director";
import { launchBrowser } from "../scraper/browser";
import type { BrandProfile, CompetitorData } from "../types";

// The full pipeline exceeds the 300s Hobby function cap if run in one
// invocation. We split it into stages; each stage runs in its own
// serverless invocation and self-triggers the next via fetch.
//
// State lives in KV (Redis), so no in-memory data carries between
// invocations. Every stage reloads the job from getJob().

export type StageResult = { done: boolean };

async function stageWebsiteAndBrand(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) return;
  const jobDir = getJobDir(jobId);

  await setStatus(jobId, "scraping-website");
  await addProgress(jobId, "Scanning website", `Loading ${job.input.companyUrl}...`);

  const websiteResult = await scrapeWebsite(job.input.companyUrl, jobDir);
  await updateJob(jobId, {
    websiteScreenshot: websiteResult.screenshotPath,
    websiteContent: websiteResult.textContent,
  });
  await addProgress(
    jobId,
    "Website scanned",
    `Captured screenshot and extracted ${websiteResult.textContent.length} characters of content`
  );

  await setStatus(jobId, "extracting-brand");
  await addProgress(jobId, "Extracting brand identity", "Analyzing colors, typography, and visual style...");

  const browser = await launchBrowser();
  let brandProfile: BrandProfile;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    try {
      await page.goto(job.input.companyUrl, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });
    } catch {
      // Continue even if nav is slow
    }
    await new Promise((r) => setTimeout(r, 2500));

    const { profile } = await extractBrandFromPage(page);

    let finalColors = profile.colors;
    if (websiteResult.localScreenshotPath) {
      await addProgress(
        jobId,
        "Reading the palette",
        "Sending homepage screenshot to Claude for color extraction..."
      );
      const vision = await extractBrandColorsFromScreenshot(
        websiteResult.localScreenshotPath
      );
      if (vision) {
        finalColors = {
          primary: vision.primary,
          secondary: vision.secondary,
          accent: vision.accent,
          background: vision.background,
          text: vision.text,
        };
        await addProgress(
          jobId,
          "Palette extracted",
          `Vision read ${vision.primary} / ${vision.secondary} / ${vision.accent} (${vision.confidence} confidence)`
        );
      } else if (paletteLooksBroken(profile.colors)) {
        await addProgress(
          jobId,
          "Palette fallback",
          "Vision unavailable, using CSS extraction (may be imperfect)"
        );
      }
    }

    const profileWithColors = { ...profile, colors: finalColors };

    const dosAndDonts = await generateBrandDosAndDonts(
      profileWithColors,
      websiteResult.textContent
    );

    brandProfile = { ...profileWithColors, dosAndDonts };
  } finally {
    await browser.close();
  }

  await updateJob(jobId, { brandProfile });
  await addProgress(
    jobId,
    "Brand extracted",
    `Found primary color ${brandProfile.colors.primary}, font ${brandProfile.typography.primary}`
  );

  await setStatus(jobId, "scraping-ads");
}

async function stageCompanyAds(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) return;
  const jobDir = getJobDir(jobId);
  const adsDir = path.join(jobDir, "ads");

  await addProgress(jobId, "Searching Meta Ad Library", `Looking for ${job.input.companyName} ads...`);

  const companyAdsResult = await scrapeMetaAdLibrary(
    job.input.companyName,
    adsDir,
    "company",
    job.input.companyUrl
  );

  await updateJob(jobId, {
    companyAds: companyAdsResult.ads,
    companyAdCount: companyAdsResult.totalCount || 0,
    companyVideoCount: companyAdsResult.videoCount || 0,
    companyImageCount: companyAdsResult.imageCount || 0,
  });

  if (companyAdsResult.success) {
    await addProgress(
      jobId,
      "Ads found",
      `${companyAdsResult.totalCount || 0} total, ${companyAdsResult.videoCount || 0} video, captured ${companyAdsResult.ads.length} image ads`
    );
  } else {
    await addProgress(jobId, "No image ads", companyAdsResult.reason || "Could not find ads in Meta Ad Library");
  }

  await setStatus(jobId, "scraping-competitor-ads");
  await updateJob(jobId, { competitorData: [] });
}

async function stageOneCompetitor(jobId: string): Promise<boolean> {
  // Returns true when all competitors have been processed.
  const job = await getJob(jobId);
  if (!job) return true;

  const done = job.competitorData ?? [];
  const remaining = (job.input.competitors || []).slice(done.length);
  if (remaining.length === 0) return true;

  const jobDir = getJobDir(jobId);
  const adsDir = path.join(jobDir, "ads");
  const competitorName = remaining[0];

  await addProgress(jobId, "Researching competitor", `Searching ads for ${competitorName}...`);

  const competitorResult = await scrapeMetaAdLibrary(
    competitorName,
    adsDir,
    competitorName.toLowerCase().replace(/\s+/g, "-")
  );

  const entry: CompetitorData = {
    name: competitorName,
    ads: competitorResult.ads,
    totalAdCount: competitorResult.totalCount || 0,
    videoAdCount: competitorResult.videoCount || 0,
    imageAdCount: competitorResult.imageCount || 0,
  };

  await updateJob(jobId, { competitorData: [...done, entry] });

  await addProgress(
    jobId,
    `${competitorName} done`,
    competitorResult.success
      ? `Found ${competitorResult.ads.length} ads`
      : competitorResult.reason || "No ads found"
  );

  return done.length + 1 >= (job.input.competitors || []).length;
}

async function stageResearcher(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) return;

  await addProgress(jobId, "Researcher agent", "Hunting real customer quotes across Reddit + reviews", { agent: "researcher" });

  const voc = await runResearcher(job.input, async (msg) => {
    const outcome = msg.includes("pass")
      ? "pass"
      : msg.includes("retry")
      ? "retry"
      : msg.includes("escalate")
      ? "escalate"
      : undefined;
    await addProgress(jobId, "Researcher", msg, { agent: "researcher", qaOutcome: outcome });
  });

  await updateJob(jobId, { voc });
  await addProgress(
    jobId,
    "VoC synthesized",
    `${voc.snippets.length} snippets, ${voc.painPoints.length} pain points, ${voc.languagePatterns.length} language patterns`,
    { agent: "researcher", qaOutcome: voc.qa?.pass ? "pass" : "escalate" }
  );

  await setStatus(jobId, "analyzing");
}

async function stageStrategist(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job || !job.voc || !job.brandProfile) return;

  await addProgress(jobId, "Strategist agent", "Running 8-area diagnosis with VoC integration", { agent: "strategist" });

  const diagnosis = await runStrategist({
    companyName: job.input.companyName,
    companyUrl: job.input.companyUrl,
    websiteContent: job.websiteContent || "",
    landingPageContent: job.input.landingPageUrl ? job.websiteContent : undefined,
    productDescription: job.input.productDescription,
    icpDescription: job.input.icpDescription,
    brandProfile: job.brandProfile,
    companyAds: job.companyAds || [],
    companyAdCount: job.companyAdCount,
    companyVideoCount: job.companyVideoCount,
    companyImageCount: job.companyImageCount,
    competitors: job.competitorData || [],
    notes: job.input.notes,
    adContentDescription: job.input.adContentDescription,
    voc: job.voc,
  }, async (msg) => {
    const outcome = msg.includes("pass")
      ? "pass"
      : msg.includes("retry")
      ? "retry"
      : msg.includes("escalate")
      ? "escalate"
      : undefined;
    await addProgress(jobId, "Strategist", msg, { agent: "strategist", qaOutcome: outcome });
  });

  await updateJob(jobId, { diagnosis });
  await addProgress(jobId, "Diagnosis complete", `QA score ${diagnosis.qa?.score ?? "n/a"}`, { agent: "strategist", qaOutcome: diagnosis.qa?.pass ? "pass" : "escalate" });

  await setStatus(jobId, "concept-architecting");
}

async function stageCreativeDirector(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job || !job.diagnosis || !job.voc) return;

  await addProgress(jobId, "Creative Director agent", "Architecting ranked concepts across awareness stages", { agent: "creative-director" });

  const concepts = await runCreativeDirector({
    diagnosis: job.diagnosis,
    voc: job.voc,
    companyName: job.input.companyName,
    icpDescription: job.input.icpDescription,
  }, async (msg) => {
    const outcome = msg.includes("pass")
      ? "pass"
      : msg.includes("retry")
      ? "retry"
      : msg.includes("escalate")
      ? "escalate"
      : undefined;
    await addProgress(jobId, "Creative Director", msg, { agent: "creative-director", qaOutcome: outcome });
  });

  await updateJob(jobId, { concepts });
  await addProgress(
    jobId,
    "Concepts ready",
    `${concepts.length} concepts across ${new Set(concepts.map((c) => c.awarenessStage)).size} awareness stages — awaiting your approval`,
    { agent: "creative-director" },
  );

  await setStatus(jobId, "awaiting-approval");

  const finalJob = await getJob(jobId);
  if (finalJob) {
    try {
      await upsertBrandFromJob(finalJob);
      await addProgress(jobId, "Brand record updated", "Saved to brand registry");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      await addProgress(jobId, "Brand record skipped", msg);
    }
  }
}

export async function runNextStage(jobId: string): Promise<StageResult> {
  const job = await getJob(jobId);
  if (!job) return { done: true };

  try {
    switch (job.status) {
      case "queued":
      case "scraping-website":
      case "extracting-brand":
        await stageWebsiteAndBrand(jobId);
        return { done: false };

      case "scraping-ads":
        await stageCompanyAds(jobId);
        return { done: false };

      case "scraping-competitor-ads": {
        const allDone = await stageOneCompetitor(jobId);
        if (allDone) await setStatus(jobId, "voc-research");
        return { done: false };
      }

      case "voc-research":
        await stageResearcher(jobId);
        return { done: false };

      case "analyzing":
        await stageStrategist(jobId);
        return { done: false };

      case "concept-architecting":
        await stageCreativeDirector(jobId);
        return { done: true };

      default:
        return { done: true };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await updateJob(jobId, { error: errorMessage });
    await setStatus(jobId, "error");
    await addProgress(jobId, "Error", errorMessage);
    return { done: true };
  }
}

// Fire a request at our own /advance endpoint so the next stage runs in
// a fresh serverless invocation (fresh 300s budget). We await the fetch
// initiation — but not a full response — so it actually goes out before
// the parent function is killed.
export async function triggerNextStage(jobId: string): Promise<void> {
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const url = `${base}/api/jobs/${jobId}/advance`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error(`Failed to trigger next stage for ${jobId}:`, err);
  }
}
