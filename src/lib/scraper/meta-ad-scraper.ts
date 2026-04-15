import puppeteer from "puppeteer";
import path from "path";
import type { AdScreenshot } from "../types";

interface MetaAdResult {
  success: boolean;
  ads: AdScreenshot[];
  totalCount?: number;
  videoCount?: number;
  imageCount?: number;
  reason?: string;
}

const delay = (ms: number) =>
  new Promise((r) => setTimeout(r, ms + Math.random() * 1000));

export async function scrapeMetaAdLibrary(
  companyName: string,
  outputDir: string,
  prefix: string = "company"
): Promise<MetaAdResult> {
  // Global timeout -- never spend more than 60s per company
  const timeoutPromise = new Promise<MetaAdResult>((resolve) =>
    setTimeout(
      () =>
        resolve({
          success: false,
          ads: [],
          reason: `Timed out searching for ${companyName} ads`,
        }),
      60000
    )
  );

  return Promise.race([timeoutPromise, scrapeMetaAdLibraryInner(companyName, outputDir, prefix)]);
}

async function scrapeMetaAdLibraryInner(
  companyName: string,
  outputDir: string,
  prefix: string
): Promise<MetaAdResult> {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  try {
    const page = await browser.newPage();

    // Stealth settings
    await page.setViewport({ width: 1440, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
    });

    // Remove webdriver flag
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });

    // Use `keyword_exact_phrase` so Meta requires the full query as a
    // contiguous phrase. `keyword_unordered` returned anything containing
    // any word ("golf" for "V1 Golf"); a bare `search_type=page` value is
    // not a real option and silently fell back to unordered.
    const searchUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&q=${encodeURIComponent(companyName)}&search_type=keyword_exact_phrase`;

    // Use domcontentloaded instead of networkidle2 -- Facebook never stops loading
    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    // Wait for content to render, but don't wait forever
    await delay(5000);

    // Check if we got results or a login wall, and extract total count
    const pageInfo = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      if (
        bodyText.includes("Log in") &&
        bodyText.includes("Create new account")
      ) {
        const mainContent = document.querySelector('[role="main"]') as HTMLElement | null;
        if (!mainContent || mainContent.innerText.length < 100) {
          return { hasResults: false, totalCount: 0 };
        }
      }
      if (bodyText.includes("No ads match your search")) {
        return { hasResults: false, totalCount: 0 };
      }

      // Try to extract "~30 results" text
      const countMatch = bodyText.match(/~?([\d,]+)\s+results?/i);
      const totalCount = countMatch
        ? parseInt(countMatch[1].replace(/,/g, ""), 10)
        : 0;

      return { hasResults: true, totalCount };
    });

    if (!pageInfo.hasResults) {
      return {
        success: false,
        ads: [],
        totalCount: 0,
        reason:
          "No ads found. Try uploading screenshots manually.",
      };
    }

    // Scroll aggressively to load more ads (infinite scroll).
    // Stop early if scroll height stops growing (end of results).
    let lastHeight = 0;
    for (let i = 0; i < 12; i++) {
      await page.evaluate(() => window.scrollBy(0, 1500));
      await delay(1000);
      const newHeight = await page.evaluate(() => document.body.scrollHeight);
      if (newHeight === lastHeight && i > 2) break;
      lastHeight = newHeight;
    }

    // Mark ad cards in the DOM -- filter to the ACTUAL advertiser AND image ads only.
    // Video ads have <video> elements or play-button icons; image ads don't.
    // We count both, but only tag image ads for screenshotting.
    const cardInfo = await page.evaluate((searchTerm: string) => {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (n) =>
            n.textContent?.includes("Library ID")
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT,
        }
      );

      const nodes: Node[] = [];
      let current = walker.nextNode();
      while (current) {
        nodes.push(current);
        current = walker.nextNode();
      }

      const tagged: Set<Element> = new Set();
      let imageCardIndex = 0;
      let totalMatchedCards = 0;
      let videoCardCount = 0;
      const normalizedTerm = searchTerm.toLowerCase().trim();

      for (const node of nodes) {
        let el: Element | null = node.parentElement;
        while (el && el.parentElement) {
          const r = el.getBoundingClientRect();
          if (r.width >= 250 && r.width <= 600 && r.height >= 300) {
            if (!tagged.has(el)) {
              let isDescendant = false;
              for (const existing of tagged) {
                if (existing.contains(el) || el.contains(existing)) {
                  isDescendant = true;
                  break;
                }
              }
              if (!isDescendant) {
                const cardText = (el as HTMLElement).innerText?.toLowerCase() || "";
                // Require advertiser name to be a reasonable length (3-80 chars)
                // to avoid matching single-character noise
                const sponsoredMatch = cardText.match(
                  /([a-z0-9][\w\s.&'-]{2,80})\s*\n?\s*sponsored/i
                );
                const advertiserName = sponsoredMatch
                  ? sponsoredMatch[1].trim().toLowerCase()
                  : "";

                // Normalize both sides by stripping common suffixes
                const strip = (s: string) =>
                  s
                    .replace(/\.(ai|io|com|co|app|so|dev|net|org)\b/g, "")
                    .replace(/\b(inc|llc|ltd|corp|co|company|group)\b/g, "")
                    .replace(/[^\w\s]/g, "")
                    .replace(/\s+/g, " ")
                    .trim();

                const normTerm = strip(normalizedTerm);
                const normAdvertiser = strip(advertiserName);

                // Strict match. Previous implementation split the search term
                // into words and kept only words >=3 chars, so "V1 Golf"
                // collapsed to just "golf" and matched every golf advertiser.
                // Require either:
                //  (a) full normalized term appears as a contiguous phrase in
                //      the advertiser name (handles "V1 Golf" → "V1 Golf …"),
                //  (b) advertiser name appears as a contiguous phrase in the
                //      search term (handles "Tally Forms" → advertiser "Tally").
                const escaped = normTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                const termInAdvertiser = new RegExp(
                  `\\b${escaped}\\b`
                ).test(normAdvertiser);
                const advertiserInTerm =
                  normAdvertiser.length >= 3 &&
                  new RegExp(
                    `\\b${normAdvertiser.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`
                  ).test(normTerm);

                const matches =
                  advertiserName.length >= 3 &&
                  normTerm.length >= 2 &&
                  (termInAdvertiser || advertiserInTerm);

                if (matches) {
                  totalMatchedCards++;

                  // Detect video ads via <video> tag (most reliable signal)
                  const hasVideo = !!el.querySelector("video");

                  if (hasVideo) {
                    videoCardCount++;
                  } else {
                    imageCardIndex++;
                  }

                  // Tag EVERY matched card (both image and video) for screenshotting.
                  // Video thumbnails are still useful diagnostically.
                  el.setAttribute(
                    "data-betteryourads-card",
                    String(totalMatchedCards - 1)
                  );
                  el.setAttribute(
                    "data-betteryourads-type",
                    hasVideo ? "video" : "image"
                  );
                  tagged.add(el);
                }
              }
            }
            break;
          }
          el = el.parentElement;
        }
      }

      return { imageCount: imageCardIndex, videoCount: videoCardCount, totalMatched: totalMatchedCards };
    }, companyName);

    // Prefer image ads first, then fill with video ads. Max 4 total.
    const MAX_CARDS = 4;
    const adCards: { text: string; adType: "video" | "image" }[] = [];

    // First pass: collect image ads
    for (let i = 0; i < cardInfo.totalMatched && adCards.length < MAX_CARDS; i++) {
      const info = await page.evaluate((idx: number) => {
        const el = document.querySelector(
          `[data-betteryourads-card="${idx}"]`
        ) as HTMLElement | null;
        if (!el) return null;
        return {
          text: el.innerText?.trim().slice(0, 800) || "",
          adType: el.getAttribute("data-betteryourads-type") || "image",
        };
      }, i);
      if (info && info.text && info.adType === "image") {
        adCards.push({ text: info.text, adType: "image" });
      }
    }

    // Second pass: fill remaining slots with video ads if needed
    for (let i = 0; i < cardInfo.totalMatched && adCards.length < MAX_CARDS; i++) {
      const info = await page.evaluate((idx: number) => {
        const el = document.querySelector(
          `[data-betteryourads-card="${idx}"]`
        ) as HTMLElement | null;
        if (!el) return null;
        return {
          text: el.innerText?.trim().slice(0, 800) || "",
          adType: el.getAttribute("data-betteryourads-type") || "image",
        };
      }, i);
      if (info && info.text && info.adType === "video") {
        adCards.push({ text: info.text, adType: "video" });
      }
    }

    if (adCards.length === 0) {
      const matched = cardInfo.videoCount + cardInfo.imageCount;
      return {
        success: false,
        ads: [],
        totalCount: matched,
        videoCount: cardInfo.videoCount,
        imageCount: 0,
        reason:
          cardInfo.videoCount > 0
            ? `${companyName} is running ${cardInfo.videoCount}+ video ads (we only screenshot images).`
            : `No ads found for "${companyName}" on their official page`,
      };
    }

    // Screenshot each ad card using Puppeteer element handles
    const ads: AdScreenshot[] = [];
    // We need to find the data-betteryourads-card index for each adCard.
    // Since adCards were picked from totalMatched, we iterate all indices and
    // match by text.
    for (const card of adCards) {
      const screenshotPath = path.join(
        outputDir,
        `${prefix}-ad-${ads.length + 1}.png`
      );

      try {
        // Find the specific card by its text signature
        const handle = await page.evaluateHandle((signature: string) => {
          const cards = document.querySelectorAll("[data-betteryourads-card]");
          for (const c of cards) {
            const t = (c as HTMLElement).innerText || "";
            if (t.includes(signature)) return c;
          }
          return null;
        }, card.text.slice(0, 60));

        const el = handle.asElement();
        if (!el) {
          await handle.dispose();
          continue;
        }

        await (el as import("puppeteer").ElementHandle<Element>).scrollIntoView();
        await delay(400);
        await (el as import("puppeteer").ElementHandle<Element>).screenshot({
          path: screenshotPath,
        });

        ads.push({
          screenshotPath,
          copyText: card.text,
          adType: card.adType,
          source: "meta-ad-library",
        });

        await handle.dispose();
      } catch (e) {
        console.error(`Failed to screenshot ad:`, e);
      }

      await delay(200);
    }

    // Use ONLY the detected advertiser-matched count.
    // The "~X results" on Meta Ad Library is a keyword match count (includes ANY ad
    // mentioning the brand name in its copy), NOT the advertiser's actual ad count.
    // Our scanned count is conservative -- the real count may be slightly higher
    // due to infinite scroll not loading everything.
    const matchedFromAdvertiser = cardInfo.videoCount + cardInfo.imageCount;

    return {
      success: ads.length > 0,
      ads,
      totalCount: matchedFromAdvertiser,
      videoCount: cardInfo.videoCount,
      imageCount: cardInfo.imageCount,
      reason:
        ads.length > 0
          ? `Captured ${ads.length} image ads (${cardInfo.videoCount} video ads not captured)`
          : "Failed to screenshot ad cards",
    };
  } catch (error) {
    return {
      success: false,
      ads: [],
      totalCount: 0,
      videoCount: 0,
      imageCount: 0,
      reason: `Scraping failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  } finally {
    await browser.close();
  }
}
