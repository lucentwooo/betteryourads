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
// function budget. Exceeding this throws so the pipeline's error handler
// can mark the job as errored instead of hanging to a 300s timeout.
const SCRAPE_TIMEOUT_MS = 90_000;

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

    // Try to dismiss cookie banners (best-effort, guarded against hangs)
    await page
      .evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button, a"));
        for (const btn of buttons) {
          const text = (btn as HTMLElement).innerText?.toLowerCase() || "";
          if (
            text.includes("accept") ||
            text.includes("allow all") ||
            text.includes("got it") ||
            text.includes("dismiss")
          ) {
            (btn as HTMLElement).click();
            break;
          }
        }
      })
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 400));

    // One short scroll to trigger lazy content, then back to top.
    await page
      .evaluate(async () => {
        window.scrollTo({ top: 2000, behavior: "instant" });
        await new Promise((r) => setTimeout(r, 300));
        window.scrollTo({ top: 0, behavior: "instant" });
        await new Promise((r) => setTimeout(r, 300));
      })
      .catch(() => {});

    // Viewport-only screenshot (fullPage can OOM + hang on large pages in
    // serverless). The hero is what the brand/vision agents care about.
    const buffer = Buffer.from(
      await page.screenshot({ fullPage: false, type: "png" })
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
