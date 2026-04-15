import { getJob, updateJob, addProgress, setStatus, getJobDir } from "./manager";
import { upsertBrandFromJob } from "../brands/manager";
import { scrapeWebsite } from "../scraper/website-scraper";
import { extractBrandFromPage } from "../scraper/brand-extractor";
import {
  extractBrandColorsFromScreenshot,
  paletteLooksBroken,
} from "../ai/brand-vision";
import { scrapeMetaAdLibrary } from "../scraper/meta-ad-scraper";
import { runDiagnosis, generateBrandDosAndDonts } from "../ai/diagnosis";
import type { BrandProfile, CompetitorData } from "../types";
import puppeteer from "puppeteer";
import path from "path";

export async function runFullAnalysis(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) return;

  const jobDir = getJobDir(jobId);

  try {
    // Step 1: Scrape company website
    await setStatus(jobId, "scraping-website");
    await addProgress(jobId, "Scanning website", `Loading ${job.input.companyUrl}...`);

    const websiteResult = await scrapeWebsite(job.input.companyUrl, jobDir);
    await updateJob(jobId, {
      websiteScreenshot: websiteResult.screenshotPath,
      websiteContent: websiteResult.textContent,
    });
    await addProgress(jobId, "Website scanned", `Captured screenshot and extracted ${websiteResult.textContent.length} characters of content`);

    // Step 2: Extract brand identity
    await setStatus(jobId, "extracting-brand");
    await addProgress(jobId, "Extracting brand identity", "Analyzing colors, typography, and visual style...");

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

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

      // Vision is the PRIMARY source of truth for colors on marketing sites
      // — CSS extraction misses anything in photos, CSS-in-JS, or
      // background-image heroes. Run it in parallel with Claude's
      // brand-voice generation so we don't add serial latency.
      let finalColors = profile.colors;
      if (websiteResult.screenshotPath) {
        await addProgress(
          jobId,
          "Reading the palette",
          "Sending homepage screenshot to Claude for color extraction..."
        );
        const vision = await extractBrandColorsFromScreenshot(
          websiteResult.screenshotPath
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
    await addProgress(jobId, "Brand extracted", `Found primary color ${brandProfile.colors.primary}, font ${brandProfile.typography.primary}`);

    // Step 3: Scrape company's Meta ads
    await setStatus(jobId, "scraping-ads");
    await addProgress(jobId, "Searching Meta Ad Library", `Looking for ${job.input.companyName} ads...`);

    const adsDir = path.join(jobDir, "ads");
    const companyAdsResult = await scrapeMetaAdLibrary(
      job.input.companyName,
      adsDir,
      "company"
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

    // Step 4: Scrape competitor ads
    await setStatus(jobId, "scraping-competitor-ads");
    const competitorData: CompetitorData[] = [];

    for (const competitorName of job.input.competitors) {
      await addProgress(jobId, "Researching competitor", `Searching ads for ${competitorName}...`);

      const competitorResult = await scrapeMetaAdLibrary(
        competitorName,
        adsDir,
        competitorName.toLowerCase().replace(/\s+/g, "-")
      );

      competitorData.push({
        name: competitorName,
        ads: competitorResult.ads,
        totalAdCount: competitorResult.totalCount || 0,
        videoAdCount: competitorResult.videoCount || 0,
        imageAdCount: competitorResult.imageCount || 0,
      });

      await addProgress(
        jobId,
        `${competitorName} done`,
        competitorResult.success
          ? `Found ${competitorResult.ads.length} ads`
          : competitorResult.reason || "No ads found"
      );

      // Small delay between competitor searches
      await new Promise((r) => setTimeout(r, 2000));
    }

    await updateJob(jobId, { competitorData });

    // Step 5: Run Claude diagnosis
    await setStatus(jobId, "analyzing");
    await addProgress(jobId, "Running diagnosis", "Analyzing positioning, messaging, and ad strategy...");

    const diagnosis = await runDiagnosis({
      companyName: job.input.companyName,
      companyUrl: job.input.companyUrl,
      websiteContent: websiteResult.textContent,
      landingPageContent: job.input.landingPageUrl
        ? websiteResult.textContent
        : undefined,
      productDescription: job.input.productDescription,
      icpDescription: job.input.icpDescription,
      brandProfile,
      companyAds: companyAdsResult.ads,
      companyAdCount: companyAdsResult.totalCount,
      companyVideoCount: companyAdsResult.videoCount,
      companyImageCount: companyAdsResult.imageCount,
      competitors: competitorData,
      notes: job.input.notes,
      adContentDescription: job.input.adContentDescription,
    });

    await updateJob(jobId, { diagnosis });
    await addProgress(jobId, "Diagnosis complete", "Full analysis ready");

    // Done
    await setStatus(jobId, "complete");

    // Upsert into brand registry (never overwrites locked fields)
    const finalJob = await getJob(jobId);
    if (finalJob) {
      try {
        await upsertBrandFromJob(finalJob);
        await addProgress(jobId, "Brand record updated", "Saved to data/brands/");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        await addProgress(jobId, "Brand record skipped", msg);
      }
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    await updateJob(jobId, { error: errorMessage });
    await setStatus(jobId, "error");
    await addProgress(jobId, "Error", errorMessage);
  }
}
