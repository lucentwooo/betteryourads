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
}

const delay = (ms: number) =>
  new Promise((r) => setTimeout(r, ms + Math.random() * 1000));

export async function scrapeMetaAdLibrary(
  companyName: string,
  outputDir: string,
  prefix: string = "company",
  companyUrl?: string
): Promise<MetaAdResult> {
  // Global timeout -- never spend more than 90s per company (covers domain
  // attempt + name fallback + scroll + screenshot capture)
  const timeoutPromise = new Promise<MetaAdResult>((resolve) =>
    setTimeout(
      () =>
        resolve({
          success: false,
          ads: [],
          reason: `Timed out searching for ${companyName} ads`,
        }),
      130000
    )
  );

  return Promise.race([timeoutPromise, scrapeMetaAdLibraryInner(companyName, outputDir, prefix, companyUrl)]);
}

/** Extract bare domain like "linear.app" from a URL or naked domain string. */
function extractDomain(raw?: string): string | undefined {
  if (!raw) return undefined;
  try {
    const u = raw.startsWith("http") ? new URL(raw) : new URL(`https://${raw}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return undefined;
  }
}

/** Map a domain TLD to a Meta Ad Library country code. */
function countryFromDomain(domain?: string): string {
  if (!domain) return "ALL";
  const tldMap: Record<string, string> = {
    "com.au": "AU",
    "co.uk": "GB",
    "co.nz": "NZ",
    "co.za": "ZA",
    "co.in": "IN",
    "com.br": "BR",
    "com.mx": "MX",
    "com.sg": "SG",
    "ca": "CA",
    "de": "DE",
    "fr": "FR",
    "es": "ES",
    "it": "IT",
    "jp": "JP",
    "kr": "KR",
    "nl": "NL",
    "se": "SE",
    "no": "NO",
    "dk": "DK",
    "ie": "IE",
  };
  for (const [tld, code] of Object.entries(tldMap)) {
    if (domain.endsWith("." + tld)) return code;
  }
  return "ALL";
}

async function scrapeMetaAdLibraryInner(
  companyName: string,
  outputDir: string,
  prefix: string,
  companyUrl?: string
): Promise<MetaAdResult> {
  const browser = await launchBrowser();

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

    // When a domain is known, prefer searching by domain (e.g. "linear.app").
    // Meta Ad Library returns results whose advertiser page links to that
    // domain, which disambiguates common words like "Linear" from unrelated
    // pages ("Linear Assicurazioni", "Linear Z Thailand", etc.).
    // Falls back to exact-phrase name search when no URL provided.
    const domain = extractDomain(companyUrl);
    // Strip TLD from domain for an additional search candidate (eatclub.com.au -> eatclub).
    const domainStem = domain ? domain.split(".")[0] : undefined;
    // Country code from TLD (.com.au -> AU, .co.uk -> GB, .ca -> CA, etc.).
    // Defaults to ALL — Meta accepts ALL as global commercial-ads search.
    const countryCode = countryFromDomain(domain);

    // Try multiple search strategies. Meta Ad Library is unforgiving:
    //   - keyword_exact_phrase on domain misses if advertiser page name
    //     doesn't literally contain the TLD (e.g. EatClub vs eatclub.com.au)
    //   - country=ALL sometimes returns nothing for region-locked advertisers
    //     until you explicitly pick the country
    // So we cycle through the most likely combinations and bail as soon as
    // any returns results.
    const attempts: { q: string; type: "keyword_exact_phrase" | "keyword_unordered"; country: string }[] = [];
    if (companyName) {
      attempts.push({ q: companyName, type: "keyword_unordered", country: countryCode });
      if (countryCode !== "ALL") attempts.push({ q: companyName, type: "keyword_unordered", country: "ALL" });
    }
    if (domainStem && domainStem.toLowerCase() !== companyName.toLowerCase()) {
      attempts.push({ q: domainStem, type: "keyword_unordered", country: countryCode });
    }
    if (domain && domain !== domainStem) {
      attempts.push({ q: domain, type: "keyword_exact_phrase", country: countryCode });
    }
    if (attempts.length === 0) attempts.push({ q: companyName, type: "keyword_unordered", country: "ALL" });

    let pageInfo = { hasResults: false, totalCount: 0 };
    let searchQuery = attempts[0].q;
    let lastBodyPreview = "";
    for (const attempt of attempts) {
      searchQuery = attempt.q;
      const searchUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${attempt.country}&q=${encodeURIComponent(attempt.q)}&search_type=${attempt.type}`;
      await page.goto(searchUrl, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });
      // First wait for ANY signal that the page rendered. Then keep waiting
      // (briefly) specifically for the count header — it usually appears a
      // beat after the cards. Without this we'd race to read totalCount=0
      // and fall through to country=ALL where keyword search returns
      // wildly inflated counts (e.g. 17,000 for a 210-ad brand).
      await page
        .waitForFunction(
          () => {
            const t = document.body.innerText || "";
            return (
              /~?[\d,]+\s+results?/i.test(t) ||
              t.includes("No ads match your search") ||
              t.includes("Library ID")
            );
          },
          { timeout: 12000 },
        )
        .catch(() => {});
      await page
        .waitForFunction(
          () => /~?[\d,]+\s+results?/i.test(document.body.innerText || ""),
          { timeout: 6000 },
        )
        .catch(() => {});
      await delay(800);
      const result = await page.evaluate(() => {
        const bodyText = document.body.innerText || "";
        const mainContent = document.querySelector('[role="main"]') as HTMLElement | null;
        const mainText = mainContent?.innerText || "";
        // Login wall: page is the auth gate, not the ad library results UI.
        // Detected by login form being the dominant content AND no Library IDs
        // anywhere in the page.
        if (
          bodyText.includes("Log in") &&
          bodyText.includes("Create new account") &&
          !bodyText.includes("Library ID") &&
          (!mainContent || mainText.length < 200)
        ) {
          return { hasResults: false, totalCount: 0, blocked: "login-wall", preview: bodyText.slice(0, 300) };
        }
        if (bodyText.includes("No ads match your search")) {
          return { hasResults: false, totalCount: 0, blocked: "no-match", preview: bodyText.slice(0, 300) };
        }
        const countMatch = bodyText.match(/~?([\d,]+)\s+results?/i);
        const totalCount = countMatch
          ? parseInt(countMatch[1].replace(/,/g, ""), 10)
          : 0;
        // Treat "Library ID" presence as ground truth for "ads loaded",
        // even when the count header didn't render.
        const hasLibraryIds = bodyText.includes("Library ID");
        return {
          hasResults: hasLibraryIds || totalCount > 0,
          totalCount,
          blocked: null,
          preview: bodyText.slice(0, 300),
        };
      });
      lastBodyPreview = result.preview;
      // Sanity cap: an unrealistic totalCount (>5000) on a country=ALL or
      // domain-keyword search is almost always keyword noise, not the
      // actual brand's ad count. Drop it to 0 so a later attempt or the
      // scanned-card fallback wins.
      const trustworthyCount =
        result.totalCount > 5000 && (attempt.country === "ALL" || attempt.q.includes("."))
          ? 0
          : result.totalCount;
      pageInfo = { hasResults: result.hasResults, totalCount: trustworthyCount };
      console.log(
        `[meta-ad-scraper] try q="${attempt.q}" type=${attempt.type} country=${attempt.country} → hasResults=${result.hasResults} count=${result.totalCount} trusted=${trustworthyCount} blocked=${result.blocked ?? "no"}`,
      );
      if (pageInfo.hasResults) break;
    }
    if (!pageInfo.hasResults) {
      console.log(`[meta-ad-scraper] all attempts exhausted. Last page preview: ${lastBodyPreview.slice(0, 200)}`);
    }

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
    const cardInfo = await page.evaluate((args: { searchTerm: string; domain?: string }) => {
      const { searchTerm, domain } = args;
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

                // Domain-based match: card text mentions our domain or its stem
                // (e.g. card for Linear.app shows "linear.app" in the page URL row).
                let domainInCard = false;
                if (domain) {
                  const domainStem = domain.replace(/\.[a-z]+$/, "");
                  const cardTextLower = (el as HTMLElement).innerText?.toLowerCase() || "";
                  if (cardTextLower.includes(domain) || cardTextLower.includes(`/${domainStem}`)) {
                    domainInCard = true;
                  }
                }

                // Strict name match: require advertiser name to equal or start
                // with the normalized search term. Rejects "Linear Assicurazioni"
                // when searching "Linear" because it's not a pure match.
                const strictNameMatch =
                  normAdvertiser === normTerm ||
                  normAdvertiser.startsWith(normTerm + " ") ||
                  normAdvertiser === normTerm.replace(/\s+/g, "");

                const looseNameMatch =
                  advertiserName.length >= 3 &&
                  normTerm.length >= 2 &&
                  (termInAdvertiser || advertiserInTerm);

                // Match policy:
                //  - Exact name match always wins (advertiser == search term).
                //  - Domain-in-card is a strong positive signal when present.
                //  - Otherwise accept loose name match. Meta Ad Library cards
                //    rarely include the full domain in visible text — the
                //    advertiser's Facebook page name is what's shown — so
                //    requiring domainInCard would zero-out most legit results
                //    (e.g. EatClub at eatclub.com.au shows page name "EatClub"
                //    with no domain text).
                const matches =
                  strictNameMatch || domainInCard || looseNameMatch;

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
    }, { searchTerm: companyName, domain });

    // Try to extract the advertiser's Meta page_id from any matched card.
    // Cards sometimes contain links like `?view_all_page_id=123` to the
    // brand's full ad list. Often they don't (Meta links by page username
    // instead of numeric ID), in which case we fall back to a search_type=page
    // query later.
    const brandPageId = await page
      .evaluate(() => {
        const cards = document.querySelectorAll("[data-betteryourads-card]");
        for (const c of cards) {
          const links = c.querySelectorAll("a[href]");
          for (const a of links) {
            const href = (a as HTMLAnchorElement).href || "";
            const m = href.match(/view_all_page_id=(\d+)/);
            if (m) return m[1];
          }
        }
        return null;
      })
      .catch(() => null);
    console.log(`[meta-ad-scraper] extracted brandPageId=${brandPageId ?? "none"}`);

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

        await (el as import("puppeteer-core").ElementHandle<Element>).scrollIntoView();
        await delay(400);
        const buf = Buffer.from(
          await (el as import("puppeteer-core").ElementHandle<Element>).screenshot({ type: "png" })
        );
        await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
        await fs.writeFile(screenshotPath, buf);

        // Upload to Blob so the stored URL is portable across cold starts.
        // outputDir is `<jobDir>/ads`, so the second-to-last segment is the
        // job id. Previously we used slice(-1) which returned the literal
        // "ads", causing every job's screenshots to overwrite each other at
        // the same blob URL — so an analysis for a brand with no ads ended
        // up showing the previous job's ads.
        const segs = outputDir.replace(/\\/g, "/").split("/").filter(Boolean);
        const jobIdLike = segs[segs.length - 2] || segs[segs.length - 1] || "unknown";
        const blobKey = `jobs/${jobIdLike}/ads/${prefix}-ad-${ads.length + 1}.png`;
        const uploadedUrl = await putImage(blobKey, buf, "image/png");

        ads.push({
          screenshotPath: uploadedUrl,
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

    // Get the TRUE brand ad count by re-querying the brand's view_all_page_id
    // URL. The keyword search "~N results" header is keyword noise (matches
    // any ad copy containing the term), e.g. "EatClub" returns ~17,000 across
    // unrelated AU food/sports advertisers. The view_all_page_id URL filters
    // to ads from THIS specific advertiser only, giving the accurate count
    // (e.g. EatClub: ~210).
    const matchedFromAdvertiser = cardInfo.videoCount + cardInfo.imageCount;
    let brandCount = 0;
    // Strategy A: if we got a page_id from a card, query the brand-specific URL
    if (brandPageId) {
      try {
        const brandUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${countryCode}&view_all_page_id=${brandPageId}&search_type=page`;
        await page.goto(brandUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
        await page
          .waitForFunction(
            () => /~?[\d,]+\s+results?/i.test(document.body.innerText || ""),
            { timeout: 10000 },
          )
          .catch(() => {});
        await delay(800);
        brandCount = await page.evaluate(() => {
          const t = document.body.innerText || "";
          const m = t.match(/~?([\d,]+)\s+results?/i);
          return m ? parseInt(m[1].replace(/,/g, ""), 10) : 0;
        });
        console.log(`[meta-ad-scraper] brand-specific count for page_id=${brandPageId}: ${brandCount}`);
      } catch (e) {
        console.warn(`[meta-ad-scraper] brand count lookup failed:`, e);
      }
    }

    // Strategy B: page-name search. Returns Meta Page tiles, each labelled
    // with the page name and its active ad count (e.g. "EatClub · 210 ads").
    // This is Meta's intended way to look up "how many ads is this brand
    // running" — and it works without needing the numeric page_id.
    if (brandCount === 0) {
      try {
        const pageSearchUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${countryCode}&q=${encodeURIComponent(companyName)}&search_type=page`;
        await page.goto(pageSearchUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
        await page
          .waitForFunction(
            () => {
              const t = document.body.innerText || "";
              return /\d[\d,]*\s+(?:active\s+)?ads?\b/i.test(t) || t.includes("No pages match");
            },
            { timeout: 10000 },
          )
          .catch(() => {});
        await delay(1000);
        brandCount = await page.evaluate((rawName: string) => {
          const norm = (s: string) =>
            s.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
          const target = norm(rawName);
          // Walk every visible block of reasonable card size; find one whose
          // text starts with the brand name and contains "N ads"/"N active ads".
          const blocks = Array.from(document.querySelectorAll("div"));
          for (const b of blocks) {
            const r = (b as HTMLElement).getBoundingClientRect();
            if (r.width < 200 || r.width > 900 || r.height < 60 || r.height > 600) continue;
            const t = (b as HTMLElement).innerText || "";
            if (t.length > 600) continue;
            const tn = norm(t);
            if (!tn.startsWith(target) && !tn.includes(" " + target)) continue;
            const m = t.match(/(\d[\d,]*)\s+(?:active\s+)?ads?\b/i);
            if (m) return parseInt(m[1].replace(/,/g, ""), 10);
          }
          // Last-resort: first ad count anywhere on the page (the page-search
          // result list usually has only matching brands).
          const first = (document.body.innerText || "").match(
            /(\d[\d,]*)\s+(?:active\s+)?ads?\b/i,
          );
          return first ? parseInt(first[1].replace(/,/g, ""), 10) : 0;
        }, companyName);
        console.log(`[meta-ad-scraper] page-search count for "${companyName}": ${brandCount}`);
      } catch (e) {
        console.warn(`[meta-ad-scraper] page-search count lookup failed:`, e);
      }
    }

    // Use brand-specific count if we got it. Otherwise fall back to the scanned
    // count (conservative but accurate). NEVER use the keyword search header —
    // that's the source of the 17,000 inflation bug.
    const displayedTotal = brandCount > 0 ? brandCount : matchedFromAdvertiser;

    return {
      success: ads.length > 0,
      ads,
      totalCount: displayedTotal,
      videoCount: cardInfo.videoCount,
      imageCount: cardInfo.imageCount,
      reason:
        ads.length > 0
          ? `Captured ${ads.length} of ${displayedTotal} active ads (showing best image samples)`
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
