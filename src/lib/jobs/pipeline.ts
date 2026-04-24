import path from "path";
import { getJob, updateJob, addProgress, setStatus, getJobDir } from "./manager";
import { upsertBrandFromJob } from "../brands/manager";
import { fetchPageText } from "../scraper/fetch-page";
import { scrapeWebsite } from "../scraper/website-scraper";
import {
  extractBrandColorsFromScreenshot,
  extractBrandColorsFromUrl,
} from "../ai/brand-vision";
import { scrapeMetaAdLibrary } from "../scraper/meta-ad-scraper";
import { generateBrandDosAndDonts } from "../ai/diagnosis";
import { runResearcher } from "../agents/researcher";
import { runStrategist } from "../agents/strategist";
import { runCreativeDirector } from "../agents/creative-director";
import type { BrandProfile, CompetitorData } from "../types";

// Hard cap for any single Meta Ad Library scrape. Chromium cold-launch
// in serverless can hang indefinitely on the tarball download; without a
// timeout it chews the whole 300s function budget. We'd rather skip ads
// for that brand than break the whole pipeline.
const META_SCRAPE_TIMEOUT_MS = 75_000;
const WEBSITE_SCREENSHOT_TIMEOUT_MS = 45_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

const DEFAULT_BRAND: Omit<BrandProfile, "dosAndDonts"> = {
  colors: {
    primary: "#111111",
    secondary: "#ffffff",
    accent: "#111111",
    background: "#ffffff",
    text: "#111111",
  },
  typography: {
    primary: "Inter",
    secondary: "Inter",
    headingWeight: 700,
    bodyWeight: 400,
  },
  visualStyle: {
    mode: "light",
    ctaShape: "rounded",
    corners: "rounded",
    aesthetic: "clean, modern",
  },
  tone: "confident, clear, customer-focused",
};

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
  await addProgress(
    jobId,
    "Scanning website",
    `Capturing screenshot and reading ${job.input.companyUrl}...`
  );

  // Screenshot is the product promise, but it must not be a single point
  // of failure. If Chromium cold-starts slowly or a site fights headless
  // browsers, we fall back to fast HTML extraction and keep the pipeline
  // moving instead of leaving users stuck on "Scanning site".
  const [screenshotRes, pageRes] = await Promise.all([
    withTimeout(
      scrapeWebsite(job.input.companyUrl, jobDir),
      WEBSITE_SCREENSHOT_TIMEOUT_MS,
      `scrapeWebsite(${job.input.companyUrl})`
    ).catch((err) => {
      console.error("[pipeline] scrapeWebsite failed:", err);
      return null;
    }),
    fetchPageText(job.input.companyUrl).catch((err) => {
      console.error("[pipeline] fetchPageText failed:", err);
      return null;
    }),
  ]);

  const websiteContent =
    screenshotRes?.textContent ||
    pageRes?.textContent ||
    pageRes?.summary ||
    `Company: ${job.input.companyName}`;

  await updateJob(jobId, {
    websiteContent,
    ...(screenshotRes?.screenshotPath
      ? { websiteScreenshot: screenshotRes.screenshotPath }
      : pageRes?.ogImage
      ? { websiteScreenshot: pageRes.ogImage }
      : {}),
  });
  await addProgress(
    jobId,
    "Website scanned",
    screenshotRes
      ? `Captured screenshot and extracted ${websiteContent.length} characters`
      : pageRes
      ? `Screenshot unavailable; extracted ${websiteContent.length} characters${
          pageRes.ogImage ? " and found og:image" : ""
        }`
      : "Could not fetch homepage — continuing with company name only"
  );

  await setStatus(jobId, "extracting-brand");
  await addProgress(
    jobId,
    "Extracting brand identity",
    screenshotRes?.localScreenshotPath
      ? "Reading brand colors from website screenshot..."
      : pageRes?.ogImage
      ? "Screenshot unavailable — reading brand colors from og:image..."
      : "No og:image — using neutral default palette"
  );

  let profile: Omit<BrandProfile, "dosAndDonts"> = DEFAULT_BRAND;
  if (screenshotRes?.localScreenshotPath || pageRes?.ogImage) {
    const vision = screenshotRes?.localScreenshotPath
      ? await extractBrandColorsFromScreenshot(screenshotRes.localScreenshotPath).catch(
          () => null
        )
      : await extractBrandColorsFromUrl(pageRes!.ogImage!).catch(() => null);
    if (vision) {
      profile = {
        ...DEFAULT_BRAND,
        colors: {
          primary: vision.primary,
          secondary: vision.secondary,
          accent: vision.accent,
          background: vision.background,
          text: vision.text,
        },
      };
      await addProgress(
        jobId,
        "Palette extracted",
        `${vision.primary} / ${vision.secondary} / ${vision.accent} (${vision.confidence})`
      );
    } else {
      await addProgress(
        jobId,
        "Palette fallback",
        "Vision couldn't read og:image — using neutral default"
      );
    }
  }

  const dosAndDonts = await generateBrandDosAndDonts(profile, websiteContent).catch(
    (err) => {
      console.error("[pipeline] dosAndDonts failed:", err);
      return { do: [], dont: [] };
    }
  );

  const brandProfile: BrandProfile = { ...profile, dosAndDonts };

  await updateJob(jobId, { brandProfile });
  await addProgress(
    jobId,
    "Brand extracted",
    `Primary ${brandProfile.colors.primary}, font ${brandProfile.typography.primary}`
  );

  await setStatus(jobId, "scraping-ads");
}

async function stageCompanyAds(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) return;
  const jobDir = getJobDir(jobId);
  const adsDir = path.join(jobDir, "ads");

  await addProgress(jobId, "Searching Meta Ad Library", `Looking for ${job.input.companyName} ads...`);

  const companyAdsResult = await withTimeout(
    scrapeMetaAdLibrary(
      job.input.companyName,
      adsDir,
      "company",
      job.input.companyUrl
    ),
    META_SCRAPE_TIMEOUT_MS,
    `scrapeMetaAdLibrary(${job.input.companyName})`
  ).catch((err) => ({
    success: false,
    ads: [],
    totalCount: 0,
    videoCount: 0,
    imageCount: 0,
    reason:
      err instanceof Error
        ? err.message
        : "Meta Ad Library scrape failed",
  }));

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

  const competitorResult = await withTimeout(
    scrapeMetaAdLibrary(
      competitorName,
      adsDir,
      competitorName.toLowerCase().replace(/\s+/g, "-")
    ),
    META_SCRAPE_TIMEOUT_MS,
    `scrapeMetaAdLibrary(${competitorName})`
  ).catch((err) => ({
    success: false,
    ads: [],
    totalCount: 0,
    videoCount: 0,
    imageCount: 0,
    reason:
      err instanceof Error ? err.message : "Meta Ad Library scrape failed",
  }));

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

// Run as many stages as we can inside a single invocation (each stage
// loads state from KV at its start, so there's no downside to batching).
// Only hand off to a fresh invocation when we're close to the 300s cap.
const STAGE_BUDGET_MS = 240_000;

export async function runStagesUntilBudget(
  jobId: string
): Promise<{ handoff: boolean }> {
  const deadline = Date.now() + STAGE_BUDGET_MS;
  while (Date.now() < deadline) {
    const result = await runNextStage(jobId);
    if (result.done) return { handoff: false };
  }
  return { handoff: true };
}

// Fire a request at our own /advance endpoint so the next batch of
// stages runs in a fresh serverless invocation. On Vercel Preview
// deployments, deployment protection blocks same-origin serverless
// fetches unless we attach the bypass header. Enable "Protection Bypass
// for Automation" in project settings — Vercel auto-provisions
// VERCEL_AUTOMATION_BYPASS_SECRET.
export async function triggerNextStage(jobId: string): Promise<void> {
  // Prefer branch-stable URL when available — the per-deployment VERCEL_URL
  // on preview can 30X-redirect through auth even with the bypass header.
  const host =
    process.env.VERCEL_BRANCH_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL;
  const base = host
    ? `https://${host}`
    : process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const qs = bypass
    ? `?x-vercel-protection-bypass=${encodeURIComponent(
        bypass
      )}&x-vercel-set-bypass-cookie=true`
    : "";
  const url = `${base}/api/jobs/${jobId}/advance${qs}`;

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (bypass) {
    headers["x-vercel-protection-bypass"] = bypass;
    headers["x-vercel-set-bypass-cookie"] = "true";
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      redirect: "manual",
    });
    // 0 (opaqueredirect), 3xx → protection bypass didn't take. Surface this
    // in the job record so we don't silently hang at the current stage.
    if (res.status === 0 || (res.status >= 300 && res.status < 400)) {
      const msg = `Handoff to /advance got ${res.status}${
        res.headers.get("location") ? ` → ${res.headers.get("location")}` : ""
      }. Check VERCEL_AUTOMATION_BYPASS_SECRET / Protection Bypass for Automation setting.`;
      console.error(msg);
      await updateJob(jobId, { error: msg });
      await setStatus(jobId, "error");
      await addProgress(jobId, "Handoff failed", msg);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to trigger next stage for ${jobId}:`, err);
    await updateJob(jobId, { error: `Handoff fetch failed: ${msg}` });
    await setStatus(jobId, "error");
    await addProgress(jobId, "Handoff failed", msg);
  }
}
