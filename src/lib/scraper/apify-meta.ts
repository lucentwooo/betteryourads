/**
 * Apify-based Meta Ad Library scraper.
 *
 * Two-pass flow to ensure we only return ads from the brand's actual page,
 * not random ads that mention the brand name in their copy:
 *
 *  Pass 1: keyword search → look at every page that surfaced, pick the one
 *          whose page_name fuzzy-matches the brand (or a hinted FB username)
 *          and has the most ads. This gives us the brand's real numeric
 *          page_id.
 *
 *  Pass 2: scope a second scrape to view_all_page_id={pageId} → returns
 *          ONLY that page's ads. Clean, brand-specific output.
 *
 * If pass 1 finds no matching page, we return success=false with a clear
 * reason so the upstream pipeline can show the user "we couldn't find your
 * brand's FB page" instead of injecting random impostor ads.
 */
import path from "path";
import { v4 as uuid } from "uuid";
import type { AdScreenshot } from "../types";
import { putImage } from "../storage/image-store";

interface ApifyResult {
  success: boolean;
  ads: AdScreenshot[];
  totalCount?: number;
  videoCount?: number;
  imageCount?: number;
  reason?: string;
  trace?: string[];
}

interface ScrapeOptions {
  countryOverride?: string;
  hintedUsernames?: string[];
  maxAds?: number;
  /** When the user has already verified their FB page during onboarding,
   * pass it here. We skip the keyword-discovery pass entirely (saves one
   * Apify call per scrape) and go straight to a page-scoped pull. This
   * also eliminates impostor-page risk — there's no fuzzy matching at all
   * when the page id is known. */
  knownPageId?: string;
  knownPageName?: string;
}

export interface FacebookPageCandidate {
  pageId: string;
  pageName: string;
  /** How well the FB page name matches the brand name (0-100). */
  matchScore: number;
  /** Number of ads attributed to this page in our discovery sample. */
  sampleAdCount: number;
  /** Public URL the user can click to verify "yes that's our page". */
  pageUrl: string;
}

const DEFAULT_ACTOR = "curious_coder/facebook-ads-library-scraper";
const DEFAULT_MAX_ADS = 30;
// Actor enforces minimum 10 charged results per run.
const MIN_COUNT = 10;
// Hard ceiling for one actor run. Pipeline gives us 130s upstream — we run
// up to two actor calls back-to-back, so each gets ~50s.
const PER_RUN_TIMEOUT_MS = 90_000;

function ensureToken(): string {
  const t = process.env.APIFY_TOKEN;
  if (!t) {
    throw new Error(
      "APIFY_TOKEN is missing. Add it in Vercel + .env.local to use the Apify scraper.",
    );
  }
  return t;
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

function buildKeywordUrl(searchTerm: string, country: string): string {
  const params = new URLSearchParams({
    active_status: "active",
    ad_type: "all",
    country,
    q: searchTerm,
    search_type: "keyword_unordered",
    media_type: "all",
  });
  return `https://www.facebook.com/ads/library/?${params.toString()}`;
}

function buildPageScopedUrl(pageId: string, country: string): string {
  const params = new URLSearchParams({
    active_status: "active",
    ad_type: "all",
    country,
    view_all_page_id: pageId,
  });
  return `https://www.facebook.com/ads/library/?${params.toString()}`;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Score how confidently a Facebook page name matches the queried brand.
 * Higher = better. 0 = no match.
 *   100  exact normalized match            ("Groupon" ~ "Groupon")
 *    70  prefix match                      ("Groupon Australia" ~ "Groupon")
 *    40  query contains page (rare)        ("Apple" ~ "Apple Inc")
 *    20  loose substring                   ("GrouponDeals" ~ "Groupon")
 *     0  unrelated                         ("Career Unlocked" ~ "Notion")
 *
 * The tiered score is what stops impostor pages — a real "Groupon" page
 * scores 100 and beats a substring-y "GrouponSpamPage" scoring 20, even
 * when the spam page has more ads in the keyword sample.
 */
function nameMatchScore(pageName: string, query: string): number {
  const a = norm(pageName);
  const b = norm(query);
  if (a.length < 2 || b.length < 2) return 0;
  if (a === b) return 100;
  if (a.startsWith(b)) return 70;
  if (b.startsWith(a)) return 40;
  if (a.includes(b)) return 20;
  if (b.includes(a)) return 15;
  return 0;
}

/**
 * Group keyword-search results by page. Pick the highest match-quality
 * page first; tie-break by ad count. Reject anything below score 40 to
 * avoid impostor pages that just happen to mention the brand somewhere.
 */
function pickBestPageMatch(
  items: unknown[],
  brandName: string,
  hintedUsernames: string[] = [],
): { pageId: string; pageName: string; count: number; score: number } | null {
  const pages = new Map<string, { pageId: string; pageName: string; count: number }>();
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const pid =
      typeof item.page_id === "string"
        ? item.page_id
        : typeof item.page_id === "number"
          ? String(item.page_id)
          : undefined;
    const pname = typeof item.page_name === "string" ? item.page_name : undefined;
    if (!pid || !pname) continue;
    const existing = pages.get(pid);
    if (existing) existing.count++;
    else pages.set(pid, { pageId: pid, pageName: pname, count: 1 });
  }

  const queries = [brandName, ...hintedUsernames.filter(Boolean)];
  const scored = [...pages.values()]
    .map((p) => ({
      ...p,
      score: Math.max(...queries.map((q) => nameMatchScore(p.pageName, q))),
    }))
    // Reject loose-substring impostors. 40+ requires either an exact
    // normalized hit, a prefix relationship, or page name fully containing
    // the brand. Bare substring (score 20) is no longer enough.
    .filter((p) => p.score >= 40);

  if (scored.length === 0) return null;
  // Best score first, then highest ad count.
  scored.sort((a, b) => (b.score - a.score) || (b.count - a.count));
  return scored[0];
}

/**
 * Defensive parser. The actor returns items with varying shapes — pull
 * what's there, return null if no usable image found.
 */
function parseAdItem(
  raw: unknown,
): { copyText: string; imageUrl?: string; isVideo: boolean; pageName?: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;

  const snapshot = (item.snapshot as Record<string, unknown> | undefined) ?? {};
  const body = (snapshot.body as Record<string, unknown> | undefined) ?? {};
  const markup = (body.markup as Record<string, unknown> | undefined) ?? {};

  const copyText =
    (typeof body.text === "string" && body.text) ||
    (typeof markup.__html === "string" && markup.__html) ||
    (typeof item.body === "string" && item.body) ||
    (typeof item.ad_creative_body === "string" && item.ad_creative_body) ||
    "";

  const pageName =
    (typeof item.page_name === "string" && item.page_name) ||
    (typeof snapshot.page_name === "string" && snapshot.page_name) ||
    undefined;

  const images = (snapshot.images as Array<Record<string, unknown>> | undefined) ?? [];
  const cards = (snapshot.cards as Array<Record<string, unknown>> | undefined) ?? [];
  const videos = (snapshot.videos as Array<Record<string, unknown>> | undefined) ?? [];

  const isVideo = videos.length > 0;

  let imageUrl: string | undefined;
  if (images.length > 0) {
    const img = images[0];
    imageUrl =
      (typeof img.original_image_url === "string" && img.original_image_url) ||
      (typeof img.resized_image_url === "string" && img.resized_image_url) ||
      undefined;
  } else if (cards.length > 0) {
    const card = cards[0];
    imageUrl =
      (typeof card.original_image_url === "string" && card.original_image_url) ||
      (typeof card.resized_image_url === "string" && card.resized_image_url) ||
      undefined;
  } else if (isVideo) {
    const v = videos[0];
    imageUrl =
      (typeof v.video_preview_image_url === "string" && v.video_preview_image_url) ||
      undefined;
  }

  if (!imageUrl) {
    if (typeof item.image_url === "string") imageUrl = item.image_url;
    else if (typeof item.thumbnail_url === "string") imageUrl = item.thumbnail_url;
  }

  if (!imageUrl) return null;
  return { copyText: copyText.trim(), imageUrl, isVideo, pageName };
}

async function downloadImage(url: string, signal: AbortSignal): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

async function runApifyActor(
  searchUrl: string,
  count: number,
  token: string,
  actorPath: string,
  log: (msg: string) => void,
): Promise<unknown[]> {
  const requestedCount = Math.max(count, MIN_COUNT);
  const input = {
    urls: [{ url: searchUrl }],
    count: requestedCount,
    scrapeAdDetails: true,
    period: "",
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_RUN_TIMEOUT_MS);

  try {
    const endpoint = `https://api.apify.com/v2/acts/${actorPath}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=80`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      log(`actor http ${res.status}: ${body.slice(0, 200)}`);
      return [];
    }

    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return [];

    // Actor returns [{ error: "..." }] when the URL had no ads — treat as empty.
    if (data.length === 1 && (data[0] as Record<string, unknown>)?.error) {
      log(`actor reported: ${(data[0] as Record<string, unknown>).error}`);
      return [];
    }
    return data;
  } catch (err) {
    const reason =
      err instanceof Error && err.name === "AbortError"
        ? "Apify run timed out"
        : err instanceof Error
          ? err.message
          : "Apify run failed";
    log(`fetch error: ${reason}`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function scrapeMetaAdLibraryViaApify(
  companyName: string,
  outputDir: string,
  prefix: string,
  companyUrl?: string,
  options?: ScrapeOptions,
): Promise<ApifyResult> {
  const trace: string[] = [];
  const log = (msg: string) => {
    const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}`;
    trace.push(line);
    console.log(`[apify-meta] ${line}`);
  };

  let token: string;
  try {
    token = ensureToken();
  } catch (err) {
    return {
      success: false,
      ads: [],
      reason: err instanceof Error ? err.message : "APIFY_TOKEN missing",
      trace,
    };
  }

  const actor = process.env.APIFY_META_ACTOR || DEFAULT_ACTOR;
  const actorPath = actor.replace("/", "~");
  const detectedCountry =
    options?.countryOverride || countryFromDomain(extractDomain(companyUrl));
  const maxAds = options?.maxAds ?? DEFAULT_MAX_ADS;
  const hintedUsernames = (options?.hintedUsernames || []).filter(Boolean);

  // Country search order: detected first, then ALL/AU/US as fallbacks. A
  // brand's FB page might run ads in a region that doesn't match the URL
  // TLD (eatclub.com.au's page can show up in country=AU but not ALL,
  // or vice versa depending on Apify's index). Sweep a few before giving up.
  const countryAttempts = [
    detectedCountry,
    ...(["ALL", "AU", "US"].filter((c) => c !== detectedCountry)),
  ];

  log(`actor=${actor} countries=[${countryAttempts.join(",")}] brand="${companyName}" hinted=${hintedUsernames.join(",") || "(none)"}`);

  let pageMatch: { pageId: string; pageName: string; count: number; score: number } | null = null;
  let pass1Items: unknown[] = [];
  let country = detectedCountry;

  // ─────────── FAST PATH: known/verified page id ───────────
  // If the user verified their FB page during onboarding, we already have
  // the canonical page_id. Skip discovery entirely — saves one Apify call
  // per scrape and zero impostor-page risk.
  if (options?.knownPageId) {
    log(`fast-path: knownPageId=${options.knownPageId} (skipping discovery)`);
    pageMatch = {
      pageId: options.knownPageId,
      pageName: options.knownPageName || companyName,
      count: 0,
      score: 100,
    };
  }

  // ──────────── PASS 1: discover brand's page_id via keyword search ────────────
  // Only runs when no known page id was passed in.
  // Try hinted FB usernames first (most precise), then the brand name itself.
  const discoveryQueries = [...hintedUsernames, companyName].filter(
    (q, i, arr) => q && arr.indexOf(q) === i,
  );

  if (!pageMatch) {
    outer: for (const c of countryAttempts) {
      for (const query of discoveryQueries) {
        log(`pass1 country=${c} keyword="${query}"`);
        const items = await runApifyActor(
          buildKeywordUrl(query, c),
          MIN_COUNT,
          token,
          actorPath,
          log,
        );
        pass1Items = items;
        if (items.length === 0) continue;

        pageMatch = pickBestPageMatch(items, companyName, hintedUsernames);
        if (pageMatch) {
          country = c;
          log(`matched page "${pageMatch.pageName}" (id=${pageMatch.pageId}) score=${pageMatch.score} count=${pageMatch.count} country=${c}`);
          break outer;
        }
        log(`no name-match in ${items.length} items for query "${query}" country=${c}`);
      }
    }
  }

  if (!pageMatch) {
    // No page whose name matches the brand was found across all queries.
    return {
      success: false,
      ads: [],
      totalCount: pass1Items.length,
      videoCount: 0,
      imageCount: 0,
      reason: `Could not find an official Facebook page for "${companyName}". Either the brand isn't running active Meta ads, or its page name differs from the brand name.`,
      trace,
    };
  }

  // ──────────── PASS 2: page-scoped scrape for clean brand-only ads ────────────
  log(`pass2 page-scoped scrape for page_id=${pageMatch.pageId}`);
  const pageItems = await runApifyActor(
    buildPageScopedUrl(pageMatch.pageId, country),
    maxAds,
    token,
    actorPath,
    log,
  );

  // Fallback: if page-scoped returns empty (e.g. country too narrow, page
  // disabled targeting), keep the matching ads from pass 1 instead of
  // showing the user nothing.
  let workingItems: unknown[];
  if (pageItems.length > 0) {
    workingItems = pageItems;
    log(`pass2 returned ${pageItems.length} brand-scoped items`);
  } else {
    workingItems = pass1Items.filter((raw) => {
      if (!raw || typeof raw !== "object") return false;
      const pid = (raw as Record<string, unknown>).page_id;
      return String(pid) === pageMatch!.pageId;
    });
    log(`pass2 empty — falling back to ${workingItems.length} pass1 items from same page`);
  }

  if (workingItems.length === 0) {
    return {
      success: false,
      ads: [],
      totalCount: 0,
      videoCount: 0,
      imageCount: 0,
      reason: `Found ${pageMatch.pageName}'s Facebook page but no active ads in country=${country}.`,
      trace,
    };
  }

  // ──────────── parse + download ────────────
  const parsed = workingItems
    .map(parseAdItem)
    .filter((p): p is NonNullable<ReturnType<typeof parseAdItem>> => p !== null);

  const totalCount = workingItems.length;
  const videoCount = parsed.filter((p) => p.isVideo).length;
  const imageCount = parsed.filter((p) => !p.isVideo).length;

  // Image ads first; video preview frames as fallback.
  const ordered = [
    ...parsed.filter((p) => !p.isVideo),
    ...parsed.filter((p) => p.isVideo),
  ];

  const ads: AdScreenshot[] = [];
  const seen = new Set<string>();
  const downloadController = new AbortController();
  const dlTimeout = setTimeout(() => downloadController.abort(), 60_000);

  try {
    for (const p of ordered) {
      if (ads.length >= maxAds) break;
      if (!p.imageUrl || seen.has(p.imageUrl)) continue;
      seen.add(p.imageUrl);

      const buf = await downloadImage(p.imageUrl, downloadController.signal);
      if (!buf) {
        log(`skip: image download failed`);
        continue;
      }

      const id = uuid().slice(0, 8);
      const filename = `${prefix}-${ads.length + 1}-${id}.png`;
      const parts = outputDir.split(path.sep).filter(Boolean);
      const tail = parts.slice(-2).join("/");
      const key = `jobs/${tail}/${filename}`;

      const url = await putImage(key, buf, "image/png");
      ads.push({
        screenshotPath: url,
        copyText: p.copyText,
        source: "meta-ad-library",
        adType: p.isVideo ? "video" : "image",
      });
    }
  } finally {
    clearTimeout(dlTimeout);
  }

  log(`captured ${ads.length} ads from ${pageMatch.pageName} (raw=${totalCount} video=${videoCount} image=${imageCount})`);

  return {
    success: ads.length > 0,
    ads,
    totalCount,
    videoCount,
    imageCount,
    reason:
      ads.length === 0
        ? `Apify returned ${totalCount} items from ${pageMatch.pageName} but none had usable images`
        : undefined,
    trace,
  };
}

/**
 * Run a single keyword search against Apify and return the top FB page
 * candidates (de-duplicated by page_id, scored by name similarity).
 *
 * Used by the onboarding "verify your Facebook page" step. The user picks
 * one and we save the page_id to the brand row, so future scrapes skip
 * discovery entirely (one Apify call instead of two).
 *
 * Costs one Apify run (10 charged results minimum). That's a one-time
 * cost per onboarded brand vs paying it on every scrape.
 */
export async function findFacebookPageCandidates(
  brandName: string,
  companyUrl?: string,
  options?: { countryOverride?: string; hintedUsernames?: string[] },
): Promise<{ candidates: FacebookPageCandidate[]; reason?: string; trace: string[] }> {
  const trace: string[] = [];
  const log = (msg: string) => {
    const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}`;
    trace.push(line);
    console.log(`[apify-find-page] ${line}`);
  };

  let token: string;
  try {
    token = ensureToken();
  } catch (err) {
    return {
      candidates: [],
      reason: err instanceof Error ? err.message : "APIFY_TOKEN missing",
      trace,
    };
  }

  const actor = process.env.APIFY_META_ACTOR || DEFAULT_ACTOR;
  const actorPath = actor.replace("/", "~");
  const detectedCountry =
    options?.countryOverride || countryFromDomain(extractDomain(companyUrl));
  const hintedUsernames = (options?.hintedUsernames || []).filter(Boolean);

  const countryAttempts = [
    detectedCountry,
    ...(["ALL", "AU", "US"].filter((c) => c !== detectedCountry)),
  ];
  const queries = [...hintedUsernames, brandName].filter(
    (q, i, arr) => q && arr.indexOf(q) === i,
  );

  const allPages = new Map<string, { pageId: string; pageName: string; count: number }>();

  // We try one query in one country at a time, but stop the moment we have
  // at least one strong (score >= 70) candidate. This keeps the cost to
  // one Apify run for clean cases.
  outer: for (const c of countryAttempts) {
    for (const q of queries) {
      log(`probe country=${c} query="${q}"`);
      const items = await runApifyActor(
        buildKeywordUrl(q, c),
        MIN_COUNT,
        token,
        actorPath,
        log,
      );
      if (items.length === 0) continue;

      for (const raw of items) {
        if (!raw || typeof raw !== "object") continue;
        const item = raw as Record<string, unknown>;
        const pid =
          typeof item.page_id === "string"
            ? item.page_id
            : typeof item.page_id === "number"
              ? String(item.page_id)
              : undefined;
        const pname = typeof item.page_name === "string" ? item.page_name : undefined;
        if (!pid || !pname) continue;
        const existing = allPages.get(pid);
        if (existing) existing.count++;
        else allPages.set(pid, { pageId: pid, pageName: pname, count: 1 });
      }

      const hasStrong = [...allPages.values()].some(
        (p) => nameMatchScore(p.pageName, brandName) >= 70,
      );
      if (hasStrong) break outer;
    }
  }

  const candidates: FacebookPageCandidate[] = [...allPages.values()]
    .map((p) => ({
      pageId: p.pageId,
      pageName: p.pageName,
      matchScore: Math.max(
        ...queries.map((q) => nameMatchScore(p.pageName, q)),
      ),
      sampleAdCount: p.count,
      pageUrl: `https://www.facebook.com/${p.pageId}`,
    }))
    .filter((p) => p.matchScore > 0)
    .sort((a, b) => (b.matchScore - a.matchScore) || (b.sampleAdCount - a.sampleAdCount))
    .slice(0, 5);

  if (candidates.length === 0) {
    return {
      candidates: [],
      reason: `Couldn't find a Facebook page matching "${brandName}". The brand may not run Meta ads, or the FB page name is very different from the company name.`,
      trace,
    };
  }

  return { candidates, trace };
}
