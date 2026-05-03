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
  /** Facebook usernames extracted from the page's links. First entry is
   * almost always the brand's own FB page. Used by the ad scraper to
   * find the brand's official page deterministically. */
  facebookUsernames?: string[];
  // When callers pass their own browser via `existingBrowser`, we leave
  // the page on the loaded URL so they can reuse it (e.g. brand extraction).
  page?: Page;
}

// Hard cap for the whole scrape: slow sites can otherwise eat the entire
// function budget. The pipeline treats screenshot failures as recoverable
// and falls back to plain HTML extraction.
const SCRAPE_TIMEOUT_MS = 75_000;
// Capture height — needs to be tall enough to feel like a "real" capture
// of the page (multiple sections), but not so tall that Chromium on
// serverless crashes mid-screenshot. 2400px gives us hero + 1-2 follow-up
// sections while staying under the threshold where Page.captureScreenshot
// reliably crashes. Brand color extraction still reads from the visible
// region; full DOM text is pulled separately so the diagnosis isn't
// degraded.
const MAX_SCREENSHOT_HEIGHT = 2400;

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
  existingBrowser?: Browser,
  onStep?: (step: string) => void,
): Promise<WebsiteScrapResult> {
  const t0 = Date.now();
  try {
    const result = await withTimeout(
      scrapeWebsiteInner(url, outputDir, existingBrowser, onStep),
      SCRAPE_TIMEOUT_MS,
      `scrapeWebsite(${url})`
    );
    onStep?.(`finished in ${Date.now() - t0}ms`);
    console.log(`[website-scraper] finished in ${Date.now() - t0}ms`);
    return result;
  } catch (e) {
    const msg = `FAILED in ${Date.now() - t0}ms: ${e instanceof Error ? e.message : e}`;
    onStep?.(msg);
    console.warn(`[website-scraper] ${msg}`);
    throw e;
  }
}

async function scrapeWebsiteInner(
  url: string,
  outputDir: string,
  existingBrowser?: Browser,
  onStep?: (step: string) => void,
): Promise<WebsiteScrapResult> {
  const step = (s: string) => {
    onStep?.(s);
    console.log(`[website-scraper] ${s}`);
  };
  step(`start url=${url}`);
  const launchStart = Date.now();
  const browser = existingBrowser ?? (await launchBrowser());
  step(`browser launched in ${Date.now() - launchStart}ms`);
  const ownBrowser = !existingBrowser;

  try {
    const page = await browser.newPage();
    step(`newPage created`);
    page.setDefaultTimeout(10_000);
    page.setDefaultNavigationTimeout(15_000);
    await page.setViewport({ width: 1440, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    step(`viewport+UA set, calling goto`);

    // Short navigation timeout — if the site is that slow, fall through
    // and screenshot whatever rendered. We don't retry with `load` because
    // that can block for another 30s and often fails the same way on
    // sites with broken third-party beacons.
    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });
      step(`page.goto OK, landed at ${page.url()}`);
    } catch (e) {
      step(`page.goto failed: ${e instanceof Error ? e.message : e}`);
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
      step(`cookie click navigated away (${page.url()}); restoring ${url}`);
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
    // No scroll loop. Repeated scrollBy + waitForNetworkIdle on a long
    // marketing page triggers lazy-loaded images/videos faster than
    // Chromium can render them, and on Vercel serverless that consumes
    // enough memory to kill the page session before we ever reach the
    // screenshot call. We just need a hero-area screenshot for brand
    // color extraction; the full DOM text comes from page.evaluate
    // anyway, not from the visual.
    step(`skipping scroll loop, capturing viewport directly`);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" })).catch(() => {});
    await new Promise((r) => setTimeout(r, 400));

    // Heavy SPAs like canva.com / framer.com keep painting indefinitely
    // (auto-playing hero videos, looping CSS animations, infinite-scroll
    // prefetch). Chromium responds to page.screenshot with
    // "Protocol error (Page.captureScreenshot): Unable to capture
    // screenshot" because the surface never settles. Freeze the page
    // before requesting the surface: stop the network, pause every
    // <video>, and disable all CSS animations/transitions.
    try {
      const cdp = await page.target().createCDPSession();
      await cdp.send("Page.stopLoading").catch(() => {});
      await cdp.detach().catch(() => {});
    } catch {
      /* ignore */
    }
    await page
      .evaluate(() => {
        document.querySelectorAll("video").forEach((v) => {
          try {
            (v as HTMLVideoElement).pause();
            (v as HTMLVideoElement).removeAttribute("autoplay");
          } catch {
            /* ignore */
          }
        });
        const style = document.createElement("style");
        style.textContent =
          "*, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }";
        document.head.appendChild(style);
      })
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 200));

    // Try to capture multiple sections of the page (hero + at least one
    // follow-up) instead of just the 900px above-fold. Some marketing pages
    // are short (one big hero), others are tall — clip to MAX_SCREENSHOT_HEIGHT
    // and let Chromium do the rest. We use captureBeyondViewport=true here
    // because we want pixels that are below the viewport.
    const captureHeight = MAX_SCREENSHOT_HEIGHT;
    step(`capturing 1440x${captureHeight} (full hero + sections) at ${page.url()}`);

    let buffer: Buffer;
    try {
      buffer = Buffer.from(
        await page.screenshot({
          type: "jpeg",
          quality: 72,
          clip: { x: 0, y: 0, width: 1440, height: captureHeight },
          captureBeyondViewport: true,
        })
      );
    } catch (e) {
      step(`clipped screenshot failed: ${e instanceof Error ? e.message : e}; trying viewport fallback`);
      try {
        buffer = Buffer.from(
          await page.screenshot({
            type: "jpeg",
            quality: 60,
            fullPage: false,
            captureBeyondViewport: false,
          })
        );
        step(`viewport fallback screenshot OK`);
      } catch (e2) {
        step(`viewport fallback failed: ${e2 instanceof Error ? e2.message : e2}; trying small clip`);
        // Last resort: shrink viewport then clip a smaller surface. Some
        // pages crash Chromium's capture pipeline at 1440 wide but succeed
        // at 1024 wide.
        try {
          await page.setViewport({ width: 1024, height: 700 });
          await new Promise((r) => setTimeout(r, 300));
          buffer = Buffer.from(
            await page.screenshot({
              type: "jpeg",
              quality: 55,
              clip: { x: 0, y: 0, width: 1024, height: 700 },
              captureBeyondViewport: false,
            })
          );
          step(`small-clip fallback screenshot OK`);
        } catch (e3) {
          step(`small-clip fallback also failed: ${e3 instanceof Error ? e3.message : e3}`);
          throw e3;
        }
      }
    }
    const localScreenshotPath = path.join(outputDir, "website-screenshot.jpg");
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(localScreenshotPath, buffer);

    step(`screenshot OK ${buffer.length} bytes`);
    const blobKey = path.posix.join(
      "jobs",
      ...outputDir.replace(/\\/g, "/").split("/").slice(-1),
      "website-screenshot.jpg"
    );
    const screenshotUrl = await putImage(blobKey, buffer, "image/jpeg");

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

      // Find Facebook page links — most brand sites link to their FB page
      // in the footer/social section. This is a far more reliable source
      // for the brand's actual FB username than a web search guess.
      const fbAnchors = Array.from(
        document.querySelectorAll('a[href*="facebook.com"]')
      ) as HTMLAnchorElement[];
      const SYSTEM_FB_PATHS = new Set([
        "ads", "policies", "privacy", "help", "pages", "business",
        "login", "signup", "about", "careers", "groups", "watch",
        "share", "sharer", "sharer.php", "tr", "dialog", "plugins",
        "v2.0", "v3.0", "v4.0", "v5.0", "v6.0", "v7.0", "v8.0", "v9.0",
      ]);
      const facebookUsernames: string[] = [];
      for (const a of fbAnchors) {
        try {
          const u = new URL(a.href);
          if (!u.hostname.endsWith("facebook.com")) continue;
          const parts = u.pathname.split("/").filter(Boolean);
          if (parts.length === 0) continue;
          const first = parts[0];
          if (!first || first.length < 2) continue;
          if (SYSTEM_FB_PATHS.has(first.toLowerCase())) continue;
          if (!facebookUsernames.includes(first)) facebookUsernames.push(first);
        } catch {
          /* ignore malformed urls */
        }
      }

      return {
        title,
        description: metaDesc,
        headings,
        heroContent,
        textContent,
        ogImage,
        facebookUsernames: facebookUsernames.slice(0, 5),
      };
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
