import path from "path";
import fs from "fs/promises";
import type { AdScreenshot } from "../types";
import { putImage } from "../storage/image-store";
import { launchBrowser } from "./browser";
import { perplexitySearch } from "../ai/openrouter";

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
  options?: { countryOverride?: string; hintedUsernames?: string[] },
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
    scrapeMetaAdLibraryInner(
      companyName,
      outputDir,
      prefix,
      companyUrl,
      options?.countryOverride,
      options?.hintedUsernames,
      log,
      trace,
    ),
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
  if (tiles.tiles.length === 0) {
    // Dump body preview so we can tell if Meta is showing a login wall,
    // a "no results" message, or actual page tiles we failed to parse.
    const bodyPreview = await page.evaluate(() => {
      const t = (document.body.innerText || "").replace(/\s+/g, " ").trim();
      return t.slice(0, 350);
    }).catch(() => "");
    log(`page-search body preview: ${bodyPreview}`);
  }
  if (!tiles.best || tiles.bestScore < 1) return null;
  return {
    pageId: tiles.best.pageId,
    pageName: tiles.best.pageName,
    activeAdCount: tiles.best.activeAdCount,
  };
}

/**
 * Strategy 2: harvest page_ids from rendered ad cards on a keyword-search
 * results page. Meta no longer honors search_type=page in the URL (always
 * serves keyword view), but every ad card still contains a link to
 * view_all_page_id=NNN. Walking those links + each card's page name lets
 * us reconstruct what the Pages tab would have given us.
 */
async function harvestPageIdFromKeywordResults(
  page: import("puppeteer-core").Page,
  searchTerm: string,
  country: string,
  log: (msg: string) => void,
): Promise<PageTile | null> {
  const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&q=${encodeURIComponent(
    searchTerm,
  )}&search_type=keyword_unordered`;
  log(`harvest GOTO country=${country} q="${searchTerm}"`);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  } catch (e) {
    log(`harvest goto failed: ${e instanceof Error ? e.message : e}`);
    return null;
  }
  await page
    .waitForFunction(() => (document.body.innerText || "").includes("Library ID"), { timeout: 12000 })
    .catch(() => {});
  await delay(800);

  // Scroll to load more cards. More cards → more page_id samples → better odds
  // of finding the brand's actual page even when results are mostly noise.
  let lastHeight = 0;
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => window.scrollBy(0, 1500));
    await delay(700);
    const newHeight = await page.evaluate(() => document.body.scrollHeight);
    if (newHeight === lastHeight && i > 2) break;
    lastHeight = newHeight;
  }

  const harvest = await page.evaluate((rawTerm: string) => {
    const norm = (s: string) =>
      s
        .toLowerCase()
        .replace(/\.(ai|io|com|co|app|so|dev|net|org)\b/g, "")
        .replace(/\b(inc|llc|ltd|corp|company|group)\b/g, "")
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const target = norm(rawTerm);
    const UI_LABELS = new Set([
      "see ad details",
      "see summary details",
      "active",
      "inactive",
      "ad library",
      "sponsored",
    ]);

    const seen = new Map<string, { pageName: string; count: number }>();
    const links = Array.from(document.querySelectorAll("a[href*='view_all_page_id=']"));
    for (const a of links) {
      const href = (a as HTMLAnchorElement).href || "";
      const m = href.match(/view_all_page_id=(\d+)/);
      if (!m) continue;
      const pageId = m[1];

      // Walk up to find the card this link belongs to.
      let el: Element | null = a;
      let pageName = "";
      while (el && el.parentElement) {
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.width >= 250 && r.width <= 700 && r.height >= 200) {
          const text = (el as HTMLElement).innerText || "";
          const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
          const sIdx = lines.findIndex((l) => l.toLowerCase() === "sponsored");
          if (sIdx > 0) {
            for (let j = sIdx - 1; j >= 0 && j >= sIdx - 4; j--) {
              const cand = lines[j];
              if (!cand || UI_LABELS.has(cand.toLowerCase())) continue;
              if (cand.length < 2 || cand.length > 80) continue;
              if (/[.!?]\s/.test(cand)) continue;
              pageName = cand;
              break;
            }
          }
          break;
        }
        el = el.parentElement;
      }
      if (!pageName) continue;
      const prev = seen.get(pageId);
      if (prev) prev.count++;
      else seen.set(pageId, { pageName, count: 1 });
    }

    // Score: exact match >> startswith >> word-contains. Add a small frequency
    // boost so a brand running 50 ads beats a 1-off mention.
    let best: { pageId: string; pageName: string; count: number; score: number } | null = null;
    for (const [pageId, info] of seen) {
      const np = norm(info.pageName);
      let score = 0;
      if (np === target) score = 100;
      else if (np.startsWith(target + " ") || np.endsWith(" " + target)) score = 60;
      else if (new RegExp(`\\b${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(np)) score = 30;
      else continue;
      score += Math.min(info.count, 20);
      if (!best || score > best.score) {
        best = { pageId, pageName: info.pageName, count: info.count, score };
      }
    }
    const sample = Array.from(seen.entries())
      .slice(0, 12)
      .map(([id, info]) => `"${info.pageName}"x${info.count}`);
    return { unique: seen.size, best, sample };
  }, searchTerm);

  log(`harvest unique=${harvest.unique} sample: ${harvest.sample.join(", ")}`);
  if (harvest.unique === 0) {
    // Diagnostic: figure out WHY there were no view_all_page_id links.
    // Either (a) cards never rendered, (b) Meta uses different URL patterns,
    // (c) we got a login wall masquerading as a results page.
    const diag = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a[href]"));
      const hrefs = anchors.map((a) => (a as HTMLAnchorElement).href).filter(Boolean);
      const sampleHrefs = hrefs.slice(0, 8);
      const uniqueHrefPatterns = new Set(
        hrefs.map((h) => {
          try {
            const u = new URL(h);
            return u.pathname.split("/").slice(0, 3).join("/") + (u.search ? "?" + Array.from(new URLSearchParams(u.search).keys()).slice(0, 3).join("&") : "");
          } catch {
            return h.slice(0, 50);
          }
        }),
      );
      const libraryIdCount = (document.body.innerText.match(/Library ID/g) || []).length;
      const sponsoredCount = (document.body.innerText.match(/Sponsored/g) || []).length;
      const articles = document.querySelectorAll('[role="article"]').length;
      const bodyLen = (document.body.innerText || "").length;
      const hasLogin = /log\s*in|sign\s*in/i.test(document.body.innerText || "");
      const hasRobot = /robot|automated|verification|captcha|suspicious activity/i.test(
        document.body.innerText || "",
      );
      return {
        totalAnchors: anchors.length,
        sampleHrefs,
        uniqueHrefPatterns: Array.from(uniqueHrefPatterns).slice(0, 10),
        libraryIdCount,
        sponsoredCount,
        articles,
        bodyLen,
        hasLogin,
        hasRobot,
      };
    }).catch(() => null);
    if (diag) {
      log(
        `DIAG anchors=${diag.totalAnchors} libraryIds=${diag.libraryIdCount} sponsored=${diag.sponsoredCount} articles=${diag.articles} bodyLen=${diag.bodyLen} login=${diag.hasLogin} robot=${diag.hasRobot}`,
      );
      log(`DIAG href patterns: ${diag.uniqueHrefPatterns.join(" || ")}`);
      log(`DIAG sample hrefs: ${diag.sampleHrefs.slice(0, 4).join(" || ")}`);
    }
  }
  if (!harvest.best) {
    log(`harvest no advertiser matched "${searchTerm}"`);
    return null;
  }
  log(`harvest BEST "${harvest.best.pageName}" id=${harvest.best.pageId} count=${harvest.best.count} score=${harvest.best.score}`);
  return {
    pageId: harvest.best.pageId,
    pageName: harvest.best.pageName,
    activeAdCount: 0, // unknown — captureAdsForPage reads it from brand URL
  };
}

/**
 * Ask Perplexity Sonar (web-search-grounded LLM) for the brand's
 * official Facebook page URL. Extract the username from the URL.
 *
 * This is the deterministic answer to "which page is the official one?"
 * Far more reliable than guessing usernames, because Perplexity searches
 * the open web and returns the verified page.
 */
async function findOfficialFacebookUsername(
  brandName: string,
  log: (msg: string) => void,
): Promise<string | null> {
  const t0 = Date.now();
  log(`search asking Perplexity for "${brandName}" official Facebook page`);
  let response: { text: string; citations: string[] };
  try {
    response = await perplexitySearch({
      prompt: `Find the most popular Facebook page for the brand "${brandName}". Search the web for it. Reply with ONLY the URL in the form https://www.facebook.com/<username> — no extra explanation, no markdown, no quotes. If multiple pages exist, return the one with the most followers. Only reply NONE if you genuinely cannot find any Facebook page for this brand at all.`,
      maxTokens: 200,
      timeoutMs: 25_000,
    });
  } catch (e) {
    log(`search Perplexity call failed: ${e instanceof Error ? e.message : e}`);
    return null;
  }
  log(`search Perplexity replied in ${Date.now() - t0}ms: "${response.text.slice(0, 200).replace(/\s+/g, " ")}"`);

  // Find the first facebook.com URL in the response. Sonar sometimes
  // includes citations alongside the answer; we accept either.
  const candidates: string[] = [response.text, ...response.citations];
  const fbUrlPattern = /https?:\/\/(?:www\.)?facebook\.com\/([A-Za-z0-9.\-_]+)/i;
  // Skip obvious system paths returned in error/redirect cases.
  const SYSTEM = new Set([
    "ads",
    "policies",
    "privacy",
    "help",
    "pages",
    "business",
    "login",
    "signup",
    "about",
    "careers",
    "company",
    "groups",
    "watch",
    "marketplace",
    "events",
    "people",
    "search",
    "settings",
  ]);
  for (const text of candidates) {
    const matches = text.matchAll(/https?:\/\/(?:www\.)?facebook\.com\/([A-Za-z0-9.\-_]+)/gi);
    for (const m of matches) {
      const username = m[1].replace(/[\/?#].*$/, "").trim();
      if (!username || username.length < 2) continue;
      if (SYSTEM.has(username.toLowerCase())) continue;
      log(`search resolved official username: "${username}"`);
      return username;
    }
  }
  log(`search no facebook.com URL extracted from Perplexity response`);
  return null;
}

/**
 * Visit facebook.com/<username>/ and extract the numeric page_id from the
 * page source. Verify the page name matches our brand.
 */
async function resolvePageIdFromUsername(
  page: import("puppeteer-core").Page,
  username: string,
  brandName: string,
  log: (msg: string) => void,
): Promise<string | null> {
  const url = `https://www.facebook.com/${username}/`;
  log(`page-resolve GOTO facebook.com/${username}`);
  let response;
  try {
    response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  } catch (e) {
    log(`page-resolve goto failed: ${e instanceof Error ? e.message : e}`);
    return null;
  }
  const status = response?.status() ?? 0;
  const finalUrl = page.url();
  if (status >= 400) {
    log(`page-resolve ${username} → ${status}`);
    return null;
  }
  if (
    finalUrl.includes("/login") ||
    finalUrl.includes("/recover") ||
    finalUrl.includes("/checkpoint")
  ) {
    log(`page-resolve ${username} redirected to ${finalUrl.slice(0, 80)}`);
    return null;
  }
  await delay(800);

  const probe = await page
    .evaluate(() => {
      const html = document.documentElement.outerHTML;
      const patterns = [
        /"pageID":"(\d{6,})"/,
        /"page_id":"(\d{6,})"/,
        /"entity_id":"(\d{6,})"/,
        /"userID":"(\d{6,})"/,
        /content="fb:\/\/page\/?(?:\?id=)?(\d{6,})"/,
        /fb:\/\/page\/\?id=(\d{6,})/,
        /entity_id=(\d{6,})/,
      ];
      let pageId: string | null = null;
      for (const p of patterns) {
        const m = html.match(p);
        if (m) {
          pageId = m[1];
          break;
        }
      }
      const ogTitle =
        document.querySelector('meta[property="og:title"]')?.getAttribute("content") || "";
      const titleText = document.title || "";
      const h1 = document.querySelector("h1")?.textContent?.trim() || "";
      return { pageId, ogTitle: ogTitle.slice(0, 100), titleText: titleText.slice(0, 100), h1: h1.slice(0, 100) };
    })
    .catch(() => null);

  if (!probe) {
    log(`page-resolve probe failed`);
    return null;
  }
  if (!probe.pageId) {
    log(`page-resolve loaded but no page_id (title="${probe.titleText}" og="${probe.ogTitle}")`);
    return null;
  }
  // Trust Perplexity's answer for name matching: if Perplexity returned
  // facebook.com/ToyotaAustralia/ for "Toyota Australia", we accept it.
  // We just need a sanity check that the page exists and renders SOMETHING.
  log(
    `page-resolve MATCH ${username} → page_id=${probe.pageId} (title="${probe.titleText}" og="${probe.ogTitle}")`,
  );
  return probe.pageId;
}

/**
 * Strategy 0: direct Facebook page lookup.
 *
 * Generate plausible username candidates from the brand name, navigate to
 * each `facebook.com/<candidate>/` URL, and extract the numeric page_id
 * from the page source. Returns the first valid page_id found.
 *
 * This is more reliable than keyword search for brands whose own ads don't
 * include the brand name in copy (most big brands — Toyota, Stripe, etc.)
 */
async function findPageIdByUsernameLookup(
  page: import("puppeteer-core").Page,
  searchTerm: string,
  log: (msg: string) => void,
): Promise<string | null> {
  const candidates = generateUsernameCandidates(searchTerm);
  log(`username-lookup trying ${candidates.length} candidates: ${candidates.slice(0, 6).join(", ")}`);

  for (const candidate of candidates) {
    const url = `https://www.facebook.com/${candidate}/`;
    let response;
    try {
      response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 12000 });
    } catch (e) {
      log(`username-lookup ${candidate} goto failed: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    const status = response?.status() ?? 0;
    const finalUrl = page.url();
    // FB redirects unknown usernames to a search page or 404.
    if (status >= 400) {
      log(`username-lookup ${candidate} → ${status}`);
      continue;
    }
    if (
      finalUrl.includes("/login") ||
      finalUrl.includes("/recover") ||
      finalUrl.includes("404") ||
      finalUrl.includes("error")
    ) {
      log(`username-lookup ${candidate} redirected to ${finalUrl.slice(0, 80)}`);
      continue;
    }

    await delay(800);

    // Mine page_id and verify the page name matches our search term. FB
    // embeds page_id in many places — try several patterns.
    const probe = await page
      .evaluate((rawTerm: string) => {
        const html = document.documentElement.outerHTML;
        const patterns = [
          /"pageID":"(\d{6,})"/,
          /"page_id":"(\d{6,})"/,
          /"entity_id":"(\d{6,})"/,
          /"userID":"(\d{6,})"/,
          /content="fb:\/\/page\/?(?:\?id=)?(\d{6,})"/,
          /fb:\/\/page\/\?id=(\d{6,})/,
          /entity_id=(\d{6,})/,
        ];
        let pageId: string | null = null;
        for (const p of patterns) {
          const m = html.match(p);
          if (m) {
            pageId = m[1];
            break;
          }
        }
        // Read page name candidates: <title>, <meta property="og:title">, h1.
        const ogTitle =
          document.querySelector('meta[property="og:title"]')?.getAttribute("content") || "";
        const titleText = document.title || "";
        const h1 = document.querySelector("h1")?.textContent?.trim() || "";
        const norm = (s: string) =>
          s
            .toLowerCase()
            .replace(/[^\w\s]/g, "")
            .replace(/\s+/g, " ")
            .trim();
        const target = norm(rawTerm);
        const candidateNames = [ogTitle, titleText, h1].filter(Boolean);
        let nameMatch = false;
        let bestName = "";
        const targetCompact = target.replace(/\s+/g, "");
        for (const n of candidateNames) {
          const nn = norm(n);
          const nc = nn.replace(/\s+/g, "");
          if (nn === target || nc === targetCompact || nc.includes(targetCompact)) {
            nameMatch = true;
            bestName = n;
            break;
          }
        }
        return {
          pageId,
          nameMatch,
          bestName,
          titleText,
          ogTitle: ogTitle.slice(0, 80),
        };
      }, searchTerm)
      .catch(() => null);

    if (!probe) {
      log(`username-lookup ${candidate} probe failed`);
      continue;
    }
    if (!probe.pageId) {
      log(
        `username-lookup ${candidate} loaded but no page_id (title="${probe.titleText.slice(0, 50)}")`,
      );
      continue;
    }
    if (!probe.nameMatch) {
      log(
        `username-lookup ${candidate} pageId=${probe.pageId} but name mismatch (og:"${probe.ogTitle}" title="${probe.titleText.slice(0, 50)}")`,
      );
      continue;
    }
    log(`username-lookup MATCH ${candidate} → page_id=${probe.pageId} name="${probe.bestName}"`);
    return probe.pageId;
  }

  log(`username-lookup exhausted all candidates`);
  return null;
}

/**
 * Brand-name-to-Facebook-username heuristics. Most brand pages use one of:
 *   - CamelCase concatenation: "Toyota Australia" → "ToyotaAustralia"
 *   - All lowercase concat: "toyotaaustralia"
 *   - Dotted lowercase: "toyota.australia"
 *   - Just first word: "Toyota" / "Stripe" / "Notion"
 *   - With "Official"/"HQ" suffix: "StripeHQ", "NotionOfficial"
 *
 * We try a deduped list, ordered by likelihood. FB usernames are
 * case-insensitive on lookup, but profiles may serve different content
 * for different cases — so we also try lowercase explicitly.
 */
function generateUsernameCandidates(searchTerm: string): string[] {
  const trimmed = searchTerm.trim();
  if (!trimmed) return [];
  // Split by whitespace and any non-alphanumeric character.
  const words = trimmed.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (words.length === 0) return [];
  const camel = words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join("");
  const lower = camel.toLowerCase();
  const dotted = words.map((w) => w.toLowerCase()).join(".");
  const first = words[0];
  const candidates: string[] = [];
  const push = (s: string) => {
    const t = s.trim();
    if (t && t.length >= 2 && !candidates.includes(t)) candidates.push(t);
  };
  push(camel);
  push(lower);
  push(dotted);
  if (words.length > 1) {
    push(first);
    push(first.toLowerCase());
    push(first + "Official");
    push(first + "HQ");
    push(first + "AU");
    push(first + "USA");
  } else {
    push(first + "Official");
    push(first + "HQ");
  }
  // Cap at 6 — each candidate costs a page.goto (~3-12s).
  return candidates.slice(0, 6);
}

/**
 * Strategy 1: replicate the user's manual flow.
 *
 * 1. Open the Ad Library landing page
 * 2. Type the brand into the search box
 * 3. Wait for the typeahead dropdown to populate with brand suggestions
 * 4. Click the first suggestion whose name matches the search term
 * 5. The click navigates to the brand's specific ad library URL
 *    (Meta sets view_all_page_id or equivalent automatically)
 *
 * Returns the brand's display name when it lands on a brand-specific page.
 * Caller should then call captureAdsAtCurrentUrl to grab count + samples.
 */
async function findOfficialPageViaTypeahead(
  page: import("puppeteer-core").Page,
  searchTerm: string,
  country: string,
  log: (msg: string) => void,
): Promise<{ pageName: string } | "no-input" | null> {
  const home = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}`;
  log(`typeahead GOTO ${country} for "${searchTerm}"`);
  try {
    await page.goto(home, { waitUntil: "domcontentloaded", timeout: 12000 });
  } catch (e) {
    log(`typeahead goto failed: ${e instanceof Error ? e.message : e}`);
    return "no-input";
  }

  // Find the search input. Meta uses a few placeholder variants depending
  // on locale ("Search by keyword or advertiser", "Search ads", etc.) so
  // we try multiple selectors. 5s budget — if it's not in the DOM by then,
  // the UI is not the shape we expect and retrying won't help.
  const inputHandle = await page
    .waitForSelector(
      'input[type="search"], input[placeholder*="keyword" i], input[placeholder*="advertiser" i], input[aria-label*="search" i]',
      { timeout: 5000 },
    )
    .catch(() => null);
  if (!inputHandle) {
    log(`typeahead no search input found`);
    return "no-input";
  }

  try {
    await inputHandle.click({ clickCount: 3 }).catch(() => {});
    await delay(200);
    await inputHandle.type(searchTerm, { delay: 80 });
  } catch (e) {
    log(`typeahead type failed: ${e instanceof Error ? e.message : e}`);
    return null;
  }
  // Wait for the dropdown's AJAX call to complete and suggestions to render.
  await delay(2200);

  // Pick a suggestion. Meta's dropdown lists brand pages first (with logos)
  // then keyword fallbacks. We want the first list item that:
  //   - has a target.length-similar normalized name
  //   - is clearly a brand entry (not "search for X")
  const suggestion = await page.evaluate((rawTerm: string) => {
    const norm = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const target = norm(rawTerm);

    // Meta uses [role="option"] for typeahead items in its newer UI.
    const optionEls = Array.from(
      document.querySelectorAll('[role="option"], [role="listitem"], li, ul > div'),
    );
    type Cand = { name: string; score: number; rect: DOMRect; el: Element };
    const cands: Cand[] = [];
    for (const el of optionEls) {
      const r = (el as HTMLElement).getBoundingClientRect();
      // Typeahead rows are short and reasonably wide.
      if (r.width < 150 || r.width > 700 || r.height < 28 || r.height > 110) continue;
      const text = (el as HTMLElement).innerText?.trim() || "";
      if (!text || text.length > 200) continue;
      // Skip "search for X" rows (those are keyword fallbacks, not brands).
      if (/^search\s+for\b/i.test(text) || /\bsearch\s+results?\b/i.test(text)) continue;

      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      // Brand suggestion typically: line[0] = "Brand Name", lines may
      // include "Page" / "Verified" labels.
      const name = lines[0];
      if (!name || name.length < 2 || name.length > 80) continue;
      const nn = norm(name);
      let score = 0;
      if (nn === target) score = 100;
      else if (nn.startsWith(target + " ")) score = 60;
      else if (nn.startsWith(target)) score = 40;
      else if (nn.includes(target)) score = 15;
      else continue;
      // Prefer rows that look "branded": include keywords like "Page", an
      // image (avatar) inside, or a "Verified" marker.
      if (/\b(page|verified|advertiser)\b/i.test(text)) score += 5;
      if (el.querySelector("img")) score += 5;
      cands.push({ name, score, rect: r, el });
    }
    if (cands.length === 0) return null;
    cands.sort((a, b) => b.score - a.score);
    const winner = cands[0];
    if (winner.score < 20) return null;
    // Click it. We dispatch both pointerdown and click since Meta sometimes
    // listens on pointer events.
    (winner.el as HTMLElement).click();
    return { name: winner.name, score: winner.score, totalCands: cands.length };
  }, searchTerm);

  if (!suggestion) {
    log(`typeahead no usable suggestion for "${searchTerm}"`);
    return null;
  }
  log(`typeahead clicked "${suggestion.name}" (score=${suggestion.score}, cands=${suggestion.totalCands})`);

  // Wait for navigation OR for new ad cards to appear in place.
  await page
    .waitForFunction(
      () => {
        const t = document.body.innerText || "";
        return /~?[\d,]+\s+results?/i.test(t) || t.includes("Library ID") || /no ads match/i.test(t);
      },
      { timeout: 12000 },
    )
    .catch(() => {});
  await delay(1200);

  const landed = page.url();
  log(`typeahead landed at ${landed.slice(0, 200)}`);
  return { pageName: suggestion.name };
}

/**
 * Read brand count and screenshot up to MAX_CARDS image-first ads from
 * whatever ad library URL the page is currently on. Used after typeahead
 * navigates us to a brand-specific page.
 */
async function captureAdsAtCurrentUrl(
  page: import("puppeteer-core").Page,
  outputDir: string,
  prefix: string,
  log: (msg: string) => void,
): Promise<{ ads: AdScreenshot[]; brandCount: number; videoCount: number; imageCount: number }> {
  const brandCount = await page.evaluate(() => {
    const t = document.body.innerText || "";
    const m = t.match(/~?([\d,]+)\s+results?/i);
    return m ? parseInt(m[1].replace(/,/g, ""), 10) : 0;
  });
  log(`current-url count=${brandCount}`);

  let lastHeight = 0;
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.scrollBy(0, 1500));
    await delay(700);
    const newHeight = await page.evaluate(() => document.body.scrollHeight);
    if (newHeight === lastHeight && i > 1) break;
    lastHeight = newHeight;
  }

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
        if (r.width >= 250 && r.width <= 700 && r.height >= 200) {
          if (!tagged.has(el)) {
            let nested = false;
            for (const existing of tagged) {
              if (existing.contains(el) || el.contains(existing)) {
                nested = true;
                break;
              }
            }
            if (!nested) {
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
  log(`current-url tagged ${cardInfo.total} cards (${cardInfo.images} image, ${cardInfo.videos} video)`);

  const MAX_CARDS = 4;
  const ads: AdScreenshot[] = [];
  for (const want of ["image", "video"] as const) {
    for (let i = 0; i < cardInfo.total && ads.length < MAX_CARDS; i++) {
      const info = await page.evaluate((idx: number) => {
        const el = document.querySelector(`[data-betteryourads-card="${idx}"]`) as HTMLElement | null;
        if (!el) return null;
        return {
          text: el.innerText?.trim().slice(0, 800) || "",
          adType: el.getAttribute("data-betteryourads-type") || "image",
        };
      }, i);
      if (!info || !info.text || info.adType !== want) continue;
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
          adType: info.adType as "image" | "video",
          source: "meta-ad-library",
        });
        await handle.dispose();
      } catch (e) {
        log(`current-url screenshot ${i} failed: ${e instanceof Error ? e.message : e}`);
      }
      await delay(200);
    }
  }
  log(`current-url captured ${ads.length} screenshots`);
  return { ads, brandCount, videoCount: cardInfo.videos, imageCount: cardInfo.images };
}

/**
 * Run a keyword search, find ad cards whose linked Facebook page username
 * matches our search term, and screenshot them in place.
 *
 * This replaces the old view_all_page_id-based approach. Meta redesigned
 * the Ad Library so cards link to facebook.com/<PageUsername>/ instead of
 * ?view_all_page_id=NNN, and search_type=page is silently ignored. So we
 * mine usernames straight from the rendered keyword results.
 */
async function captureFromKeywordSearch(
  page: import("puppeteer-core").Page,
  searchTerm: string,
  country: string,
  outputDir: string,
  prefix: string,
  log: (msg: string) => void,
  options?: { exactUsername?: string },
): Promise<{
  ads: AdScreenshot[];
  matchedCards: number;
  videoCount: number;
  imageCount: number;
  pageName?: string;
  pageId?: string;
}> {
  const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&q=${encodeURIComponent(
    searchTerm,
  )}&search_type=keyword_unordered`;
  log(`username-search GOTO country=${country} q="${searchTerm}"`);
  // Meta's regional Ad Library endpoints (especially country=AU) sporadically
  // take 15-25s to respond. Bump timeout and retry once before giving up.
  let gotoSucceeded = false;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
      gotoSucceeded = true;
      break;
    } catch (e) {
      log(`username-search goto attempt ${attempt} failed: ${e instanceof Error ? e.message : e}`);
      if (attempt === 2) break;
      await delay(1500);
    }
  }
  if (!gotoSucceeded) {
    return { ads: [], matchedCards: 0, videoCount: 0, imageCount: 0 };
  }
  await page
    .waitForFunction(() => (document.body.innerText || "").includes("Library ID"), { timeout: 12000 })
    .catch(() => {});
  await delay(800);

  let lastHeight = 0;
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => window.scrollBy(0, 1500));
    await delay(700);
    const newHeight = await page.evaluate(() => document.body.scrollHeight);
    if (newHeight === lastHeight && i > 2) break;
    lastHeight = newHeight;
  }

  // Find every card containing both "Library ID" and "Sponsored". For each,
  // pull the first facebook.com/<username>/ link inside it (the advertiser
  // page link). Tag matching cards by username similarity to search term.
  const cardScan = await page.evaluate((args: { rawTerm: string; exactUsername?: string }) => {
    const { rawTerm, exactUsername } = args;
    const norm = (s: string) =>
      s
        .toLowerCase()
        .replace(/\.(ai|io|com|co|app|so|dev|net|org)\b/g, "")
        .replace(/\b(inc|llc|ltd|corp|company|group)\b/g, "")
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const target = norm(rawTerm);
    // Facebook system paths that aren't user/page slugs.
    const SYSTEM_PATHS = new Set([
      "ads",
      "policies",
      "privacy",
      "help",
      "pages",
      "business",
      "login",
      "signup",
      "about",
      "careers",
      "company",
      "groups",
      "watch",
      "marketplace",
      "events",
      "gaming",
      "messages",
      "photos",
      "videos",
      "fbid.php",
      "people",
      "search",
      "settings",
      "notifications",
      "fundraisers",
      "saved",
      "memories",
      "feed",
      "home.php",
      "sharer.php",
      "dialog",
      "tr",
      "l.php",
    ]);
    const extractUsername = (href: string): string | null => {
      try {
        const u = new URL(href);
        if (u.hostname !== "www.facebook.com" && u.hostname !== "facebook.com") return null;
        const parts = u.pathname.split("/").filter(Boolean);
        if (parts.length === 0) return null;
        const first = parts[0];
        if (!first || first.length < 2) return null;
        if (SYSTEM_PATHS.has(first.toLowerCase())) return null;
        return first;
      } catch {
        return null;
      }
    };

    // Walk every text node containing "Library ID" up to its visual card.
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

    const cards: { el: Element; username: string; pageId: string | null }[] = [];
    const seen = new Set<Element>();
    for (const node of nodes) {
      let el: Element | null = node.parentElement;
      while (el && el.parentElement) {
        const r = el.getBoundingClientRect();
        if (r.width >= 250 && r.width <= 700 && r.height >= 200) {
          if (seen.has(el)) break;
          // Avoid nesting overlap.
          let nested = false;
          for (const existing of seen) {
            if (existing.contains(el) || el.contains(existing)) {
              nested = true;
              break;
            }
          }
          if (nested) break;
          // Pull first viable username link inside this card.
          const links = Array.from(el.querySelectorAll("a[href]"));
          let username: string | null = null;
          let pageId: string | null = null;
          for (const a of links) {
            const href = (a as HTMLAnchorElement).href || "";
            if (!username) {
              const u = extractUsername(href);
              if (u) username = u;
            }
            if (!pageId) {
              const m = href.match(/view_all_page_id=(\d{6,})/);
              if (m) pageId = m[1];
            }
            if (username && pageId) break;
          }
          if (username) {
            seen.add(el);
            cards.push({ el, username, pageId });
          }
          break;
        }
        el = el.parentElement;
      }
    }

    // Score each card's username against the target. Brand FB usernames
    // are usually concatenated CamelCase ("OmodaJaecooAustralia") while
    // search terms have spaces ("Jaecoo Australia"). Strip spaces from
    // both for a "compact" comparison; that's the dominant signal.
    const usernameCounts: Record<string, number> = {};
    for (const c of cards) usernameCounts[c.username] = (usernameCounts[c.username] || 0) + 1;
    const targetCompact = target.replace(/\s+/g, "");
    const targetWords = target.split(/\s+/).filter((w) => w.length >= 2);
    let bestUsername: string | null = null;
    let bestScore = -1;

    // If caller provided an exactUsername (e.g. confirmed by Perplexity),
    // bypass scoring entirely — just match cards whose username equals it
    // (case-insensitive).
    if (exactUsername) {
      const targetExact = exactUsername.toLowerCase();
      for (const username of Object.keys(usernameCounts)) {
        if (username.toLowerCase() === targetExact) {
          bestUsername = username;
          bestScore = 999;
          break;
        }
      }
    }

    if (!bestUsername) for (const [username, count] of Object.entries(usernameCounts)) {
      const nu = norm(username);
      const nuCompact = nu.replace(/\s+/g, "");
      let score = 0;
      if (nu === target) score = 100;
      else if (nuCompact === targetCompact) score = 95;
      else if (nu.startsWith(target) || target.startsWith(nu)) score = 60;
      // OmodaJaecooAustralia contains JaecooAustralia → strong signal that
      // this is a regional/sub-brand of the searched brand.
      else if (nuCompact.includes(targetCompact) && targetCompact.length >= 5) score = 50;
      else if (targetCompact.includes(nuCompact) && nuCompact.length >= 5) score = 35;
      // Every meaningful word of the target appears somewhere in the
      // (concatenated) username. Catches "Toyota Australia" → ToyotaAU,
      // "Better Help" → BetterHelp, etc.
      else if (
        targetWords.length >= 2 &&
        targetWords.every((w) => nuCompact.includes(w))
      )
        score = 30;
      else if (
        new RegExp(`\\b${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(nu) ||
        new RegExp(`\\b${nu.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(target)
      )
        score = 20;
      else continue;
      score += Math.min(count, 20);
      if (score > bestScore) {
        bestScore = score;
        bestUsername = username;
      }
    }

    // Tag matching cards (those whose username == bestUsername) for screenshot.
    let imageCount = 0;
    let videoCount = 0;
    let totalMatched = 0;
    const pageIdVotes: Record<string, number> = {};
    if (bestUsername) {
      for (const c of cards) {
        if (c.username !== bestUsername) continue;
        const hasVideo = !!c.el.querySelector("video");
        if (hasVideo) videoCount++;
        else imageCount++;
        c.el.setAttribute("data-betteryourads-card", String(totalMatched));
        c.el.setAttribute("data-betteryourads-type", hasVideo ? "video" : "image");
        totalMatched++;
        if (c.pageId) pageIdVotes[c.pageId] = (pageIdVotes[c.pageId] || 0) + 1;
      }
    }
    // Most-voted pageId among matched cards (deterministic — same brand
    // username always points to the same numeric page id).
    let bestPageId: string | null = null;
    let bestVotes = 0;
    for (const [pid, votes] of Object.entries(pageIdVotes)) {
      if (votes > bestVotes) {
        bestVotes = votes;
        bestPageId = pid;
      }
    }

    const sample = Object.entries(usernameCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([u, c]) => `${u}x${c}`);

    return {
      cardsScanned: cards.length,
      bestUsername,
      bestScore,
      bestPageId,
      totalMatched,
      imageCount,
      videoCount,
      sample,
    };
  }, { rawTerm: searchTerm, exactUsername: options?.exactUsername });

  log(
    `username-search cards=${cardScan.cardsScanned} matched=${cardScan.totalMatched} best="${
      cardScan.bestUsername ?? "none"
    }" score=${cardScan.bestScore} pageId=${cardScan.bestPageId ?? "n/a"}`,
  );
  if (cardScan.cardsScanned > 0) {
    log(`username-search sample: ${cardScan.sample.join(", ")}`);
  }
  if (cardScan.totalMatched === 0) {
    return { ads: [], matchedCards: 0, videoCount: 0, imageCount: 0 };
  }

  const MAX_CARDS = 4;
  const ads: AdScreenshot[] = [];
  // Image first, then fill with video.
  for (const want of ["image", "video"] as const) {
    for (let i = 0; i < cardScan.totalMatched && ads.length < MAX_CARDS; i++) {
      const info = await page.evaluate((idx: number) => {
        const el = document.querySelector(`[data-betteryourads-card="${idx}"]`) as HTMLElement | null;
        if (!el) return null;
        return {
          text: el.innerText?.trim().slice(0, 800) || "",
          adType: el.getAttribute("data-betteryourads-type") || "image",
        };
      }, i);
      if (!info || !info.text || info.adType !== want) continue;
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
          adType: info.adType as "image" | "video",
          source: "meta-ad-library",
        });
        await handle.dispose();
      } catch (e) {
        log(`username-search screenshot ${i} failed: ${e instanceof Error ? e.message : e}`);
      }
      await delay(200);
    }
  }
  log(`username-search captured ${ads.length} screenshots`);
  return {
    ads,
    matchedCards: cardScan.totalMatched,
    videoCount: cardScan.videoCount,
    imageCount: cardScan.imageCount,
    pageName: cardScan.bestUsername ?? undefined,
    pageId: cardScan.bestPageId ?? undefined,
  };
}

/**
 * Lightweight count fetch — navigates to the brand's view_all_page_id URL
 * and reads the "~XX results" header. Skips screenshotting entirely. Used
 * when keyword-username-match already captured screenshots but we want
 * Meta's authoritative active-ad count for the brand.
 */
async function readBrandCountForPageId(
  page: import("puppeteer-core").Page,
  pageId: string,
  country: string,
  log: (msg: string) => void,
): Promise<number> {
  const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&view_all_page_id=${pageId}&search_type=page`;
  log(`brand-count GOTO page_id=${pageId} country=${country}`);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  } catch (e) {
    log(`brand-count goto failed: ${e instanceof Error ? e.message : e}`);
    return 0;
  }
  await page
    .waitForFunction(
      () => {
        const t = document.body.innerText || "";
        return /~?[\d,]+\s+results?/i.test(t) || /no ads match/i.test(t);
      },
      { timeout: 10000 },
    )
    .catch(() => {});
  const count = await page.evaluate(() => {
    const t = document.body.innerText || "";
    const m = t.match(/~?([\d,]+)\s+results?/i);
    return m ? parseInt(m[1].replace(/,/g, ""), 10) : 0;
  });
  log(`brand-count read=${count}`);
  return count;
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
): Promise<{ ads: AdScreenshot[]; videoCount: number; imageCount: number; brandCount: number }> {
  const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&view_all_page_id=${pageId}&search_type=page`;
  log(`brand-ads GOTO page_id=${pageId} country=${country}`);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  } catch (e) {
    log(`brand-ads goto failed: ${e instanceof Error ? e.message : e}`);
    return { ads: [], videoCount: 0, imageCount: 0, brandCount: 0 };
  }
  await page
    .waitForFunction(
      () => {
        const t = document.body.innerText || "";
        return /~?[\d,]+\s+results?/i.test(t) || t.includes("Library ID") || /no ads match/i.test(t);
      },
      { timeout: 12000 },
    )
    .catch(() => {});
  await delay(1000);

  // Read the brand's active ad count straight from the page header.
  // On view_all_page_id pages this is the TRUE count for that brand only,
  // not keyword-noise.
  const brandCount = await page.evaluate(() => {
    const t = document.body.innerText || "";
    const m = t.match(/~?([\d,]+)\s+results?/i);
    return m ? parseInt(m[1].replace(/,/g, ""), 10) : 0;
  });
  log(`brand-ads count=${brandCount}`);

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
  return { ads, videoCount: cardInfo.videos, imageCount: cardInfo.images, brandCount };
}

async function scrapeMetaAdLibraryInner(
  companyName: string,
  outputDir: string,
  prefix: string,
  companyUrl: string | undefined,
  countryOverride: string | undefined,
  hintedUsernames: string[] | undefined,
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
    // countryOverride takes precedence — used by competitor scrapes that
    // want to inherit the analyzed brand's country context without
    // accidentally inheriting the brand's domain stem as a search term.
    const primaryCountry = countryOverride || countryFromDomain(domain);

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

    // Strategy 0 (primary): web-search for the brand's official Facebook
    // page (via Perplexity Sonar), then go straight to that page to read
    // its numeric page_id, then load the brand's specific Ad Library URL.
    //
    // Why this works when keyword search doesn't: big brands' own ads
    // don't include their brand name in copy ("Get a great deal on the
    // new HiLux"), so they're invisible to keyword search. But there's
    // exactly one official Facebook page per brand, and a search engine
    // can find it deterministically.
    let confirmedUsername: string | null = null;
    // First, prefer any usernames extracted from the brand's own website
    // (e.g. footer FB link). These are deterministically the right page —
    // a brand wouldn't link to a competitor's FB from their own site.
    if (hintedUsernames && hintedUsernames.length > 0) {
      const hint = hintedUsernames[0];
      log(`hint using FB username from website: "${hint}"`);
      confirmedUsername = hint;
      const pageId = await resolvePageIdFromUsername(page, hint, companyName, log);
      if (pageId) {
        const captured = await captureAdsForPage(page, pageId, primaryCountry, outputDir, prefix, log);
        if (captured.brandCount > 0 || captured.ads.length > 0) {
          log(`DONE strategy=hint-lookup username=${hint} pageId=${pageId} ads=${captured.ads.length} brandCount=${captured.brandCount}`);
          return {
            success: captured.ads.length > 0,
            ads: captured.ads,
            totalCount: captured.brandCount || captured.imageCount + captured.videoCount,
            videoCount: captured.videoCount,
            imageCount: captured.imageCount,
            reason:
              captured.ads.length > 0
                ? `Found ${captured.brandCount || captured.imageCount + captured.videoCount} active ads on ${companyName}'s official Facebook page; captured ${captured.ads.length} samples.`
                : `${companyName} runs ${captured.brandCount} active ads but they're all video.`,
            trace,
          };
        }
      }
    }
    if (!confirmedUsername) {
      const username = await findOfficialFacebookUsername(companyName, log);
      if (username) {
        confirmedUsername = username;
        const pageId = await resolvePageIdFromUsername(page, username, companyName, log);
        if (pageId) {
          const captured = await captureAdsForPage(page, pageId, primaryCountry, outputDir, prefix, log);
          if (captured.brandCount > 0 || captured.ads.length > 0) {
            log(
              `DONE strategy=search-lookup username=${username} pageId=${pageId} ads=${captured.ads.length} brandCount=${captured.brandCount}`,
            );
            return {
              success: captured.ads.length > 0,
              ads: captured.ads,
              totalCount: captured.brandCount || captured.imageCount + captured.videoCount,
              videoCount: captured.videoCount,
              imageCount: captured.imageCount,
              reason:
                captured.ads.length > 0
                  ? `Found ${captured.brandCount || captured.imageCount + captured.videoCount} active ads on ${companyName}'s official Facebook page; captured ${captured.ads.length} samples.`
                  : `${companyName} runs ${captured.brandCount} active ads but they're all video.`,
              trace,
            };
          }
        }
      }
    }

    // Strategy 0b: Perplexity gave us a confirmed username but FB blocked
    // the profile page (login wall). Use the username directly as the
    // exact match criterion against keyword search results — bypassing
    // fuzzy brand-name matching entirely.
    if (confirmedUsername) {
      log(`falling through to keyword search with confirmed username="${confirmedUsername}"`);
      for (const country of countryOrder) {
        const captured = await captureFromKeywordSearch(
          page,
          confirmedUsername,
          country,
          outputDir,
          prefix,
          log,
          { exactUsername: confirmedUsername },
        );
        if (captured.matchedCards > 0) {
          let trueCount = 0;
          if (captured.pageId) {
            trueCount = await readBrandCountForPageId(page, captured.pageId, country, log);
          }
          const totalCount = trueCount > 0 ? trueCount : captured.matchedCards;
          log(
            `DONE strategy=confirmed-username ads=${captured.ads.length} matched=${captured.matchedCards} totalCount=${totalCount} username=${confirmedUsername}`,
          );
          return {
            success: captured.ads.length > 0,
            ads: captured.ads,
            totalCount,
            videoCount: captured.videoCount,
            imageCount: captured.imageCount,
            reason:
              captured.ads.length > 0
                ? `Captured ${captured.ads.length} of ${totalCount} active ads for ${confirmedUsername}.`
                : `Saw ${captured.matchedCards} matching cards but couldn't screenshot any image ads.`,
            trace,
          };
        }
        // Also try the brand name as keyword (some ads do mention it).
        const captured2 = await captureFromKeywordSearch(
          page,
          companyName,
          country,
          outputDir,
          prefix,
          log,
          { exactUsername: confirmedUsername },
        );
        if (captured2.matchedCards > 0) {
          let trueCount = 0;
          if (captured2.pageId) {
            trueCount = await readBrandCountForPageId(page, captured2.pageId, country, log);
          }
          const totalCount = trueCount > 0 ? trueCount : captured2.matchedCards;
          log(
            `DONE strategy=confirmed-username-brand-keyword ads=${captured2.ads.length} matched=${captured2.matchedCards} totalCount=${totalCount}`,
          );
          return {
            success: captured2.ads.length > 0,
            ads: captured2.ads,
            totalCount,
            videoCount: captured2.videoCount,
            imageCount: captured2.imageCount,
            reason:
              captured2.ads.length > 0
                ? `Captured ${captured2.ads.length} of ${totalCount} active ads for ${confirmedUsername}.`
                : `Saw ${captured2.matchedCards} matching cards but couldn't screenshot any image ads.`,
            trace,
          };
        }
      }
    }

    // Strategy 1 (preferred): mimic the user's manual flow — type the brand
    // name into the Ad Library search box, click the suggested OFFICIAL page,
    // and read ads from that brand's specific URL. Gives us Meta's true
    // active ad count plus only that brand's ads (no keyword noise).
    //
    // Bail fast if the FIRST attempt can't even find the search input —
    // that means Meta's UI shape doesn't match our selectors and retrying
    // across (term × country) just burns 10s per attempt for nothing.
    let typeaheadAvailable = true;
    outerTypeahead: for (const term of searchTerms) {
      if (!typeaheadAvailable) break;
      for (const country of countryOrder) {
        if (!typeaheadAvailable) break outerTypeahead;
        const found = await findOfficialPageViaTypeahead(page, term, country, log);
        if (found === "no-input") {
          // Meta isn't rendering the search box for our headless session.
          // Skip remaining typeahead attempts.
          typeaheadAvailable = false;
          break outerTypeahead;
        }
        if (!found) continue;
        if (found) {
          const captured = await captureAdsAtCurrentUrl(page, outputDir, prefix, log);
          if (captured.brandCount > 0 || captured.ads.length > 0) {
            log(
              `DONE strategy=typeahead pageName="${found.pageName}" ads=${captured.ads.length} brandCount=${captured.brandCount}`,
            );
            return {
              success: captured.ads.length > 0,
              ads: captured.ads,
              totalCount: captured.brandCount || captured.imageCount + captured.videoCount,
              videoCount: captured.videoCount,
              imageCount: captured.imageCount,
              reason:
                captured.ads.length > 0
                  ? `${found.pageName} runs ${captured.brandCount || captured.imageCount + captured.videoCount} active ads; captured ${captured.ads.length} samples.`
                  : `${found.pageName} runs ${captured.brandCount} active ads but they're all video (we only screenshot images).`,
              trace,
            };
          }
        }
      }
    }

    // Strategy 2 (fallback): keyword search + match by Facebook page username.
    // Use this when typeahead fails (rare brand, dropdown selectors changed,
    // etc.) — we mine usernames out of rendered cards instead.
    for (const term of searchTerms) {
      for (const country of countryOrder) {
        const captured = await captureFromKeywordSearch(
          page,
          term,
          country,
          outputDir,
          prefix,
          log,
        );
        if (captured.matchedCards > 0) {
          // If we harvested a numeric page_id from the matched cards, ask
          // Meta for the brand's authoritative active-ad count. Avoids
          // reporting "2 ads" when the brand actually runs hundreds.
          let trueCount = 0;
          if (captured.pageId) {
            trueCount = await readBrandCountForPageId(page, captured.pageId, country, log);
          }
          const totalCount = trueCount > 0 ? trueCount : captured.matchedCards;
          log(
            `DONE strategy=keyword-username-match ads=${captured.ads.length} matched=${captured.matchedCards} totalCount=${totalCount} pageName="${captured.pageName ?? "n/a"}"`,
          );
          return {
            success: captured.ads.length > 0,
            ads: captured.ads,
            totalCount,
            videoCount: captured.videoCount,
            imageCount: captured.imageCount,
            reason:
              captured.ads.length > 0
                ? `Captured ${captured.ads.length} of ${totalCount} active ads for ${captured.pageName ?? companyName}.`
                : `Saw ${captured.matchedCards} matching cards but couldn't screenshot any image ads (likely all video).`,
            trace,
          };
        }
      }
    }

    log(`all strategies exhausted — no ads found for "${companyName}"`);
    return {
      success: false,
      ads: [],
      totalCount: 0,
      videoCount: 0,
      imageCount: 0,
      reason: `No matching ads for "${companyName}" on Meta. They may not be running ads, or Meta isn't serving them to our region.`,
      trace,
    };
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
