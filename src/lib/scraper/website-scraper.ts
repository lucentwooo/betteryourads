import path from "path";
import fs from "fs/promises";
import type { Browser, Page } from "puppeteer-core";
import { putImage } from "../storage/image-store";
import { launchBrowser } from "./browser";

export interface WebsiteScrapResult {
  screenshotPath: string; // URL (Blob https URL in prod, /api/screenshots/... in dev)
  localScreenshotPath: string; // absolute filesystem path for in-pipeline tools (sharp, etc.)
  textContent: string;
  title: string;
  description: string;
  headings: string[];
  heroContent: string;
  ogImage?: string;
  // When callers pass their own browser via `existingBrowser`, we leave
  // the page on the loaded URL so they can reuse it (e.g. brand extraction).
  page?: Page;
}

// Hard cap for the whole scrape: slow sites can otherwise eat the entire
// function budget. The pipeline treats screenshot failures as recoverable
// and falls back to plain HTML extraction.
const SCRAPE_TIMEOUT_MS = 75_000;
const MAX_SCREENSHOT_HEIGHT = 8000;

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

export async function scrapeWebsite(
  url: string,
  outputDir: string,
  existingBrowser?: Browser
): Promise<WebsiteScrapResult> {
  return withTimeout(
    scrapeWebsiteInner(url, outputDir, existingBrowser),
    SCRAPE_TIMEOUT_MS,
    `scrapeWebsite(${url})`
  );
}

async function scrapeWebsiteInner(
  url: string,
  outputDir: string,
  existingBrowser?: Browser
): Promise<WebsiteScrapResult> {
  const browser = existingBrowser ?? (await launchBrowser());
  const ownBrowser = !existingBrowser;

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(10_000);
    page.setDefaultNavigationTimeout(15_000);
    await page.setViewport({ width: 1440, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Short navigation timeout — if the site is that slow, fall through
    // and screenshot whatever rendered. We don't retry with `load` because
    // that can block for another 30s and often fails the same way on
    // sites with broken third-party beacons.
    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });
    } catch {
      // Continue with whatever state rendered.
    }

    await new Promise((r) => setTimeout(r, 1500));

    // Try to dismiss cookie banners. Restrict to <button> only — clicking <a>
    // tags whose text happens to contain "accept" or "got it" can navigate the
    // page away from the homepage entirely (e.g. /accept-terms), and the
    // subsequent screenshot captures the wrong page.
    const urlBefore = page.url();
    await page
      .evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        for (const btn of buttons) {
          const text = (btn as HTMLElement).innerText?.toLowerCase().trim() || "";
          // Strict word-boundary match. "accept" alone is ambiguous; require
          // typical cookie-banner phrasing.
          if (
            /^(accept|accept all|accept cookies|allow all|allow cookies|got it|i agree|ok|dismiss)$/i.test(text)
          ) {
            (btn as HTMLElement).click();
            break;
          }
        }
      })
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 400));
    // If something we clicked navigated away, recover by re-navigating to the
    // original URL. Otherwise the screenshot is of the wrong page.
    if (page.url() !== urlBefore) {
      console.log(`[website-scraper] cookie click navigated away (${page.url()}); restoring ${url}`);
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
        await new Promise((r) => setTimeout(r, 1000));
      } catch {
        /* keep whatever rendered */
      }
    }

    // Lazy-loaded marketing pages only render below-fold sections AFTER the
    // viewport reaches them AND after their network requests complete. We
    // need three things: scroll deep enough to trigger every section, wait
    // for those sections' images/JS to actually finish loading, then return
    // to top before screenshotting. Otherwise the measured scrollHeight is
    // tiny and we screenshot only the hero.
    let lastHeight = 0;
    for (let i = 0; i < 10; i++) {
      const newHeight = await page
        .evaluate(() => {
          window.scrollBy(0, 1500);
          return document.documentElement.scrollHeight;
        })
        .catch(() => 0);
      // Brief settle for lazy images. Aggressive cap: total time across the
      // loop is bounded so we don't blow past SCRAPE_TIMEOUT_MS.
      await page
        .waitForNetworkIdle({ idleTime: 300, timeout: 800 })
        .catch(() => {});
      if (newHeight === lastHeight && i > 2) break;
      lastHeight = newHeight;
    }
    // Scroll back to top and let any sticky/header repositioning settle.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" })).catch(() => {});
    await new Promise((r) => setTimeout(r, 600));

    const pageHeight = await page
      .evaluate(() => {
        const body = document.body;
        const html = document.documentElement;
        return Math.max(
          body?.scrollHeight || 0,
          body?.offsetHeight || 0,
          html?.clientHeight || 0,
          html?.scrollHeight || 0,
          html?.offsetHeight || 0
        );
      })
      .catch(() => 900);
    const captureHeight = Math.max(
      900,
      Math.min(Math.ceil(pageHeight), MAX_SCREENSHOT_HEIGHT)
    );
    console.log(`[website-scraper] measured pageHeight=${pageHeight} captureHeight=${captureHeight} finalUrl=${page.url()}`);

    // Capture from the top of the page down to a safe height cap. Puppeteer's
    // fullPage mode can OOM on huge marketing pages in serverless, but a
    // clipped capture still gives the UI and brand analysis a real website
    // screenshot instead of an og:image stand-in.
    const buffer = Buffer.from(
      await page.screenshot({
        type: "png",
        clip: { x: 0, y: 0, width: 1440, height: captureHeight },
      })
    );
    const localScreenshotPath = path.join(outputDir, "website-screenshot.png");
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(localScreenshotPath, buffer);

    const blobKey = path.posix.join(
      "jobs",
      ...outputDir.replace(/\\/g, "/").split("/").slice(-1),
      "website-screenshot.png"
    );
    const screenshotUrl = await putImage(blobKey, buffer, "image/png");

    const pageData = await page.evaluate(() => {
      const title = document.title || "";
      const metaDesc =
        document
          .querySelector('meta[name="description"]')
          ?.getAttribute("content") || "";
      const ogImage =
        document
          .querySelector('meta[property="og:image"]')
          ?.getAttribute("content") || undefined;

      const headings = Array.from(
        document.querySelectorAll("h1, h2, h3")
      ).map((el) => el.textContent?.trim() || "");

      const heroEl =
        document.querySelector("main > section:first-child") ||
        document.querySelector("main > div:first-child") ||
        document.querySelector('[class*="hero"]') ||
        document.querySelector("header + section") ||
        document.querySelector("header + div");
      const heroContent = heroEl?.textContent?.trim().slice(0, 2000) || "";

      const textContent = document.body.innerText.slice(0, 10000);

      return { title, description: metaDesc, headings, heroContent, textContent, ogImage };
    });

    return {
      screenshotPath: screenshotUrl,
      localScreenshotPath,
      ...pageData,
      page: existingBrowser ? page : undefined,
    };
  } finally {
    if (ownBrowser) {
      await browser.close().catch(() => {});
    }
  }
}
