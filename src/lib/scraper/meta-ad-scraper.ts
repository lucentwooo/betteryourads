import path from "path";
import fs from "fs/promises";
import type { AdScreenshot } from "../types";
import { putImage } from "../storage/image-store";
import { launchBrowser } from "./browser";

interface MetaAdResult {
  success: boolean;
  ads: AdScreenshot[];
  totalCount?: number;
  videoCount?: number;
  imageCount?: number;
  reason?: string;
  trace?: string[];
}

const delay = (ms: number) =>
  new Promise((r) => setTimeout(r, ms + Math.random() * 600));

export async function scrapeMetaAdLibrary(
  companyName: string,
  outputDir: string,
  prefix: string = "company",
  companyUrl?: string,
): Promise<MetaAdResult> {
  const trace: string[] = [];
  const log = (msg: string) => {
    const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}`;
    trace.push(line);
    console.log(`[meta-ad-scraper] ${line}`);
  };

  const timeoutPromise = new Promise<MetaAdResult>((resolve) =>
    setTimeout(
      () =>
        resolve({
          success: false,
          ads: [],
          reason: `Timed out searching for ${companyName} ads`,
          trace,
        }),
      130000,
    ),
  );

  return Promise.race([
    timeoutPromise,
    scrapeMetaAdLibraryInner(companyName, outputDir, prefix, companyUrl, log, trace),
  ]);
}

function extractDomain(raw?: string): string | undefined {
  if (!raw) return undefined;
  try {
    const u = raw.startsWith("http") ? new URL(raw) : new URL(`https://${raw}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return undefined;
  }
}

function countryFromDomain(domain?: string): string {
  if (!domain) return "ALL";
  const tldMap: Record<string, string> = {
    "com.au": "AU", "co.uk": "GB", "co.nz": "NZ", "co.za": "ZA",
    "co.in": "IN", "com.br": "BR", "com.mx": "MX", "com.sg": "SG",
    ca: "CA", de: "DE", fr: "FR", es: "ES", it: "IT", jp: "JP",
    kr: "KR", nl: "NL", se: "SE", no: "NO", dk: "DK", ie: "IE",
  };
  for (const [tld, code] of Object.entries(tldMap)) {
    if (domain.endsWith("." + tld)) return code;
  }
  return "ALL";
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\.(ai|io|com|co|app|so|dev|net|org)\b/g, "")
    .replace(/\b(inc|llc|ltd|corp|company|group)\b/g, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface PageTile {
  pageId: string;
  pageName: string;
  activeAdCount: number;
}

/**
 * Strategy 1 (primary): hit Meta Ad Library's Pages tab and find the tile
 * that matches our brand. This is way more reliable than keyword-searching
 * ad copy because each tile is one Page with its TRUE active ad count
 * already displayed by Meta.
 */
async function findBrandPageTile(
  page: import("puppeteer-core").Page,
  searchTerm: string,
  country: string,
  log: (msg: string) => void,
): Promise<PageTile | null> {
  const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&q=${encodeURIComponent(
    searchTerm,
  )}&search_type=page`;
  log(`page-search GOTO country=${country} q="${searchTerm}"`);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  } catch (e) {
    log(`page-search goto failed: ${e instanceof Error ? e.message : e}`);
    return null;
  }
  // Wait for either page tiles or empty state.
  await page
    .waitForFunction(
      () => {
        const t = document.body.innerText || "";
        return (
          /\d[\d,.]*\s*[KkMm]?\s+(?:active\s+)?ads?\b/i.test(t) ||
          /no pages match/i.test(t) ||
          /no results/i.test(t)
        );
      },
      { timeout: 12000 },
    )
    .catch(() => {});
  await delay(1200);

  const tiles = await page.evaluate((rawTerm: string) => {
    const norm = (s: string) =>
      s
        .toLowerCase()
        .replace(/\.(ai|io|com|co|app|so|dev|net|org)\b/g, "")
        .replace(/\b(inc|llc|ltd|corp|company|group)\b/g, "")
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const target = norm(rawTerm);
    const results: { pageId: string; pageName: string; activeAdCount: number; rawText: string }[] = [];

    // Each Page tile contains a link to ?view_all_page_id=NNN. Walk those.
    const links = Array.from(document.querySelectorAll("a[href*='view_all_page_id=']"));
    const seen = new Set<string>();
    for (const a of links) {
      const href = (a as HTMLAnchorElement).href || "";
      const m = href.match(/view_all_page_id=(\d+)/);
      if (!m) continue;
      const pageId = m[1];
      if (seen.has(pageId)) continue;
      seen.add(pageId);

      // Walk up to find the tile container — biggest ancestor still <800px wide.
      let el: Element | null = a;
      let bestContainer: HTMLElement | null = null;
      while (el && el.parentElement) {
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.width > 200 && r.width < 800 && r.height > 60 && r.height < 600) {
          bestContainer = el as HTMLElement;
        }
        el = el.parentElement;
      }
      const container = bestContainer ?? (a.parentElement as HTMLElement | null);
      if (!container) continue;

      const text = (container.innerText || "").trim();
      if (!text || text.length > 800) continue;

      // First non-empty, reasonably-short line is usually the page name.
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      let pageName = "";
      for (const line of lines) {
        if (line.length >= 2 && line.length <= 80 && !/active\s+ads?/i.test(line) && !/page\s*[·•]/i.test(line)) {
          pageName = line;
          break;
        }
      }
      if (!pageName) continue;

      // Active ad count: handle "43 active ads", "1.2K active ads", "1 active ad".
      const countMatch = text.match(/(\d[\d,.]*)\s*([KkMm]?)\s+(?:active\s+)?ads?\b/i);
      let activeAdCount = 0;
      if (countMatch) {
        const num = parseFloat(countMatch[1].replace(/,/g, ""));
        const suffix = countMatch[2].toLowerCase();
        activeAdCount = suffix === "k" ? Math.round(num * 1000) : suffix === "m" ? Math.round(num * 1_000_000) : Math.round(num);
      }

      results.push({ pageId, pageName, activeAdCount, rawText: text.slice(0, 200) });
    }

    // Score: exact normalized match → starts-with → contains. Keep best.
    let best: { pageId: string; pageName: string; activeAdCount: number; rawText: string } | null = null;
    let bestScore = -1;
    for (const r of results) {
      const np = norm(r.pageName);
      let score = -1;
      if (np === target) score = 3;
      else if (np.startsWith(target + " ") || np.endsWith(" " + target)) score = 2;
      else if (np.includes(target)) score = 1;
      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }
    return { tiles: results.slice(0, 8), best, bestScore };
  }, searchTerm);

  log(
    `page-search found ${tiles.tiles.length} tiles. Best: ${
      tiles.best ? `"${tiles.best.pageName}" id=${tiles.best.pageId} ads=${tiles.best.activeAdCount} score=${tiles.bestScore}` : "none"
    }`,
  );
  if (tiles.tiles.length > 0 && tiles.tiles.length <= 5) {
    log(`page-search tiles: ${tiles.tiles.map((t) => `"${t.pageName}"(${t.activeAdCount})`).join(", ")}`);
  }
  if (!tiles.best || tiles.bestScore < 1) return null;
  return {
    pageId: tiles.best.pageId,
    pageName: tiles.best.pageName,
    activeAdCount: tiles.best.activeAdCount,
  };
}

/**
 * Once we have a page_id, navigate to that brand's ad URL and screenshot
 * up to MAX_CARDS image ads. Returns ads + image/video counts observed.
 */
async function captureAdsForPage(
  page: import("puppeteer-core").Page,
  pageId: string,
  country: string,
  outputDir: string,
  prefix: string,
  log: (msg: string) => void,
): Promise<{ ads: AdScreenshot[]; videoCount: number; imageCount: number }> {
  const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&view_all_page_id=${pageId}&search_type=page`;
  log(`brand-ads GOTO page_id=${pageId} country=${country}`);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  } catch (e) {
    log(`brand-ads goto failed: ${e instanceof Error ? e.message : e}`);
    return { ads: [], videoCount: 0, imageCount: 0 };
  }
  await page
    .waitForFunction(
      () => {
        const t = document.body.innerText || "";
        return t.includes("Library ID") || /no ads match/i.test(t);
      },
      { timeout: 12000 },
    )
    .catch(() => {});
  await delay(1000);

  // Scroll a few times to load enough cards for screenshotting.
  let lastHeight = 0;
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.scrollBy(0, 1500));
    await delay(800);
    const newHeight = await page.evaluate(() => document.body.scrollHeight);
    if (newHeight === lastHeight && i > 1) break;
    lastHeight = newHeight;
  }

  // Tag every card on this page (no name matching needed — every ad here is from this brand).
  const cardInfo = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        n.textContent?.includes("Library ID") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });
    const nodes: Node[] = [];
    let cur = walker.nextNode();
    while (cur) {
      nodes.push(cur);
      cur = walker.nextNode();
    }
    const tagged: Set<Element> = new Set();
    let total = 0;
    let videos = 0;
    let images = 0;
    for (const node of nodes) {
      let el: Element | null = node.parentElement;
      while (el && el.parentElement) {
        const r = el.getBoundingClientRect();
        if (r.width >= 250 && r.width <= 600 && r.height >= 300) {
          if (!tagged.has(el)) {
            let ancestorTagged = false;
            for (const existing of tagged) {
              if (existing.contains(el) || el.contains(existing)) {
                ancestorTagged = true;
                break;
              }
            }
            if (!ancestorTagged) {
              const hasVideo = !!el.querySelector("video");
              if (hasVideo) videos++;
              else images++;
              el.setAttribute("data-betteryourads-card", String(total));
              el.setAttribute("data-betteryourads-type", hasVideo ? "video" : "image");
              tagged.add(el);
              total++;
            }
          }
          break;
        }
        el = el.parentElement;
      }
    }
    return { total, videos, images };
  });
  log(`brand-ads tagged ${cardInfo.total} cards (${cardInfo.images} image, ${cardInfo.videos} video)`);

  const MAX_CARDS = 4;
  const ads: AdScreenshot[] = [];
  const seen = new Set<number>();

  // Prefer image cards.
  const order: ("image" | "video")[] = ["image", "video"];
  for (const want of order) {
    for (let i = 0; i < cardInfo.total && ads.length < MAX_CARDS; i++) {
      if (seen.has(i)) continue;
      const info = await page.evaluate((idx: number) => {
        const el = document.querySelector(`[data-betteryourads-card="${idx}"]`) as HTMLElement | null;
        if (!el) return null;
        return {
          text: el.innerText?.trim().slice(0, 800) || "",
          adType: el.getAttribute("data-betteryourads-type") || "image",
        };
      }, i);
      if (!info || !info.text || info.adType !== want) continue;
      seen.add(i);

      const screenshotPath = path.join(outputDir, `${prefix}-ad-${ads.length + 1}.png`);
      try {
        const handle = await page.evaluateHandle((idx: number) => {
          return document.querySelector(`[data-betteryourads-card="${idx}"]`);
        }, i);
        const el = handle.asElement();
        if (!el) {
          await handle.dispose();
          continue;
        }
        await (el as import("puppeteer-core").ElementHandle<Element>).scrollIntoView();
        await delay(400);
        const buf = Buffer.from(
          await (el as import("puppeteer-core").ElementHandle<Element>).screenshot({ type: "png" }),
        );
        await fs.mkdir(outputDir, { recursive: true });
        await fs.writeFile(screenshotPath, buf);

        const segs = outputDir.replace(/\\/g, "/").split("/").filter(Boolean);
        const jobIdLike = segs[segs.length - 2] || segs[segs.length - 1] || "unknown";
        const blobKey = `jobs/${jobIdLike}/ads/${prefix}-ad-${ads.length + 1}.png`;
        const uploadedUrl = await putImage(blobKey, buf, "image/png");

        ads.push({
          screenshotPath: uploadedUrl,
          copyText: info.text,
          adType: info.adType as "image" | "video",
          source: "meta-ad-library",
        });
        await handle.dispose();
      } catch (e) {
        log(`screenshot card ${i} failed: ${e instanceof Error ? e.message : e}`);
      }
      await delay(200);
    }
  }
  log(`brand-ads captured ${ads.length} screenshots`);
  return { ads, videoCount: cardInfo.videos, imageCount: cardInfo.images };
}

async function scrapeMetaAdLibraryInner(
  companyName: string,
  outputDir: string,
  prefix: string,
  companyUrl: string | undefined,
  log: (msg: string) => void,
  trace: string[],
): Promise<MetaAdResult> {
  log(`START companyName="${companyName}" url=${companyUrl ?? "n/a"}`);
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    });

    const domain = extractDomain(companyUrl);
    const domainStem = domain ? domain.split(".")[0] : undefined;
    const primaryCountry = countryFromDomain(domain);

    // Strategy 1: page-search first. Try the most specific country, then broaden.
    // Country order: derived-from-domain > US > ALL. Skip duplicates.
    const countryOrder: string[] = [];
    const pushCountry = (c: string) => {
      if (!countryOrder.includes(c)) countryOrder.push(c);
    };
    pushCountry(primaryCountry);
    pushCountry("US");
    pushCountry("ALL");

    const searchTerms: string[] = [];
    const pushTerm = (t?: string) => {
      if (!t) return;
      const trimmed = t.trim();
      if (!trimmed) return;
      if (!searchTerms.find((x) => x.toLowerCase() === trimmed.toLowerCase())) {
        searchTerms.push(trimmed);
      }
    };
    pushTerm(companyName);
    if (domainStem && normalize(domainStem) !== normalize(companyName)) pushTerm(domainStem);

    let foundTile: PageTile | null = null;
    let foundCountry = primaryCountry;
    outer: for (const term of searchTerms) {
      for (const country of countryOrder) {
        const tile = await findBrandPageTile(page, term, country, log);
        if (tile) {
          foundTile = tile;
          foundCountry = country;
          break outer;
        }
      }
    }

    if (foundTile) {
      log(`MATCH page="${foundTile.pageName}" id=${foundTile.pageId} country=${foundCountry} activeAds=${foundTile.activeAdCount}`);
      const captured = await captureAdsForPage(
        page,
        foundTile.pageId,
        foundCountry,
        outputDir,
        prefix,
        log,
      );
      const total = foundTile.activeAdCount || captured.imageCount + captured.videoCount;
      log(`DONE strategy=page-search ads=${captured.ads.length} brandCount=${total}`);
      return {
        success: captured.ads.length > 0,
        ads: captured.ads,
        totalCount: total,
        videoCount: captured.videoCount,
        imageCount: captured.imageCount,
        reason:
          captured.ads.length > 0
            ? `Found ${total} active ads on ${foundTile.pageName}'s page; captured ${captured.ads.length} samples.`
            : foundTile.activeAdCount > 0
              ? `${foundTile.pageName} runs ${foundTile.activeAdCount} active ads but we couldn't grab image samples (likely all video).`
              : `${foundTile.pageName} is registered on Meta but has no active ads right now.`,
        trace,
      };
    }

    // Strategy 2: keyword fallback. Reach this when no Page tile matched —
    // the brand may not have a verified Meta page or our matcher missed it.
    log(`page-search exhausted, falling back to keyword search`);
    const fallback = await keywordSearchFallback(page, companyName, domain, primaryCountry, outputDir, prefix, log);
    return { ...fallback, trace };
  } catch (error) {
    log(`FATAL ${error instanceof Error ? error.message : "Unknown error"}`);
    return {
      success: false,
      ads: [],
      totalCount: 0,
      videoCount: 0,
      imageCount: 0,
      reason: `Scraping failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      trace,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function keywordSearchFallback(
  page: import("puppeteer-core").Page,
  companyName: string,
  domain: string | undefined,
  primaryCountry: string,
  outputDir: string,
  prefix: string,
  log: (msg: string) => void,
): Promise<MetaAdResult> {
  const countries = Array.from(new Set([primaryCountry, "US", "ALL"]));
  let landed = false;
  for (const country of countries) {
    const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&q=${encodeURIComponent(
      companyName,
    )}&search_type=keyword_unordered`;
    log(`keyword GOTO country=${country}`);
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    } catch (e) {
      log(`keyword goto failed: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    await page
      .waitForFunction(
        () => {
          const t = document.body.innerText || "";
          return t.includes("Library ID") || /no ads match/i.test(t);
        },
        { timeout: 10000 },
      )
      .catch(() => {});
    await delay(800);
    const hasIds = await page.evaluate(() => (document.body.innerText || "").includes("Library ID"));
    if (hasIds) {
      landed = true;
      log(`keyword country=${country} has Library IDs, scrolling`);
      break;
    }
  }
  if (!landed) {
    log(`keyword fallback found nothing across ${countries.join(",")}`);
    return {
      success: false,
      ads: [],
      totalCount: 0,
      videoCount: 0,
      imageCount: 0,
      reason: `No Meta Ad Library results for "${companyName}". They may not run ads on Meta.`,
    };
  }

  let lastHeight = 0;
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.scrollBy(0, 1500));
    await delay(800);
    const newHeight = await page.evaluate(() => document.body.scrollHeight);
    if (newHeight === lastHeight && i > 1) break;
    lastHeight = newHeight;
  }

  // Reuse the strict matcher to filter by name.
  const cardInfo = await page.evaluate((args: { searchTerm: string; domain?: string }) => {
    const { searchTerm, domain } = args;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        n.textContent?.includes("Library ID") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });
    const nodes: Node[] = [];
    let cur = walker.nextNode();
    while (cur) {
      nodes.push(cur);
      cur = walker.nextNode();
    }
    const strip = (s: string) =>
      s
        .toLowerCase()
        .replace(/\.(ai|io|com|co|app|so|dev|net|org)\b/g, "")
        .replace(/\b(inc|llc|ltd|corp|company|group)\b/g, "")
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const normTerm = strip(searchTerm);
    const tagged: Set<Element> = new Set();
    let total = 0;
    let videos = 0;
    let images = 0;
    for (const node of nodes) {
      let el: Element | null = node.parentElement;
      while (el && el.parentElement) {
        const r = el.getBoundingClientRect();
        if (r.width >= 250 && r.width <= 600 && r.height >= 300) {
          if (!tagged.has(el)) {
            let ancestor = false;
            for (const existing of tagged) {
              if (existing.contains(el) || el.contains(existing)) {
                ancestor = true;
                break;
              }
            }
            if (!ancestor) {
              const cardText = (el as HTMLElement).innerText?.toLowerCase() || "";
              const sponsoredMatch = cardText.match(/([a-z0-9][\w\s.&'-]{2,80})\s*\n?\s*sponsored/i);
              const advertiserName = sponsoredMatch ? sponsoredMatch[1].trim().toLowerCase() : "";
              const normAdv = strip(advertiserName);
              const strictMatch =
                normAdv === normTerm ||
                normAdv.startsWith(normTerm + " ") ||
                normAdv === normTerm.replace(/\s+/g, "");
              const isShortSingleWord = !normTerm.includes(" ") && normTerm.length <= 8;
              const escaped = normTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
              const looseMatch =
                !isShortSingleWord &&
                advertiserName.length >= 3 &&
                normTerm.length >= 2 &&
                (new RegExp(`\\b${escaped}\\b`).test(normAdv) ||
                  (normAdv.length >= 3 &&
                    new RegExp(`\\b${normAdv.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(normTerm)));
              let domainInCard = false;
              if (domain) {
                const cardLower = (el as HTMLElement).innerText?.toLowerCase() || "";
                if (cardLower.includes(domain)) domainInCard = true;
              }
              if (strictMatch || domainInCard || looseMatch) {
                const hasVideo = !!el.querySelector("video");
                if (hasVideo) videos++;
                else images++;
                el.setAttribute("data-betteryourads-card", String(total));
                el.setAttribute("data-betteryourads-type", hasVideo ? "video" : "image");
                tagged.add(el);
                total++;
              }
            }
          }
          break;
        }
        el = el.parentElement;
      }
    }
    return { total, videos, images };
  }, { searchTerm: companyName, domain });
  log(`keyword matched ${cardInfo.total} cards (${cardInfo.images} image, ${cardInfo.videos} video)`);

  if (cardInfo.total === 0) {
    return {
      success: false,
      ads: [],
      totalCount: 0,
      videoCount: 0,
      imageCount: 0,
      reason: `No matching ads for "${companyName}". They likely aren't running Meta ads under this brand name.`,
    };
  }

  const MAX_CARDS = 4;
  const ads: AdScreenshot[] = [];
  for (let i = 0; i < cardInfo.total && ads.length < MAX_CARDS; i++) {
    const info = await page.evaluate((idx: number) => {
      const el = document.querySelector(`[data-betteryourads-card="${idx}"]`) as HTMLElement | null;
      if (!el) return null;
      return {
        text: el.innerText?.trim().slice(0, 800) || "",
        adType: el.getAttribute("data-betteryourads-type") || "image",
      };
    }, i);
    if (!info || !info.text) continue;
    if (info.adType !== "image") continue;
    try {
      const handle = await page.evaluateHandle((idx: number) => {
        return document.querySelector(`[data-betteryourads-card="${idx}"]`);
      }, i);
      const el = handle.asElement();
      if (!el) {
        await handle.dispose();
        continue;
      }
      await (el as import("puppeteer-core").ElementHandle<Element>).scrollIntoView();
      await delay(400);
      const buf = Buffer.from(
        await (el as import("puppeteer-core").ElementHandle<Element>).screenshot({ type: "png" }),
      );
      await fs.mkdir(outputDir, { recursive: true });
      const screenshotPath = path.join(outputDir, `${prefix}-ad-${ads.length + 1}.png`);
      await fs.writeFile(screenshotPath, buf);
      const segs = outputDir.replace(/\\/g, "/").split("/").filter(Boolean);
      const jobIdLike = segs[segs.length - 2] || segs[segs.length - 1] || "unknown";
      const blobKey = `jobs/${jobIdLike}/ads/${prefix}-ad-${ads.length + 1}.png`;
      const uploadedUrl = await putImage(blobKey, buf, "image/png");
      ads.push({
        screenshotPath: uploadedUrl,
        copyText: info.text,
        adType: "image",
        source: "meta-ad-library",
      });
      await handle.dispose();
    } catch (e) {
      log(`keyword screenshot ${i} failed: ${e instanceof Error ? e.message : e}`);
    }
    await delay(200);
  }

  log(`DONE strategy=keyword ads=${ads.length} matchedCards=${cardInfo.total}`);
  return {
    success: ads.length > 0,
    ads,
    totalCount: cardInfo.total,
    videoCount: cardInfo.videos,
    imageCount: cardInfo.images,
    reason:
      ads.length > 0
        ? `Captured ${ads.length} of ${cardInfo.total} matched ads via keyword fallback.`
        : `Found ${cardInfo.total} matching cards but couldn't screenshot any image ads.`,
  };
}
