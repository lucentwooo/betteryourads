/**
 * Lightweight HTML fetcher for tasks that don't need a real browser —
 * competitor suggestion, text-only extraction, etc. Avoids the 20-60s
 * chromium cold start entirely.
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface FetchPageResult {
  title: string;
  description: string;
  headings: string[];
  /** Compact summary suitable for LLM input: title + meta + first headings. */
  summary: string;
  raw: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchPageText(
  url: string,
  timeoutMs = 10_000
): Promise<FetchPageResult> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  let html = "";
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": UA,
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} from ${url}`);
    }
    html = await res.text();
  } finally {
    clearTimeout(t);
  }

  const title = decodeEntities(
    (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").trim()
  );

  const descMatch =
    html.match(
      /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i
    ) ||
    html.match(
      /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i
    ) ||
    html.match(
      /<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']*)["']/i
    );
  const description = decodeEntities((descMatch?.[1] || "").trim());

  const headingMatches = Array.from(
    html.matchAll(/<(h1|h2|h3)[^>]*>([\s\S]*?)<\/\1>/gi)
  );
  const headings = headingMatches
    .map((m) => decodeEntities(stripTags(m[2])))
    .filter((h) => h.length > 0 && h.length < 200)
    .slice(0, 12);

  // Summary optimised for LLM: keep under ~2000 chars to save tokens.
  const bodyText = stripTags(html).slice(0, 1500);
  const summary = [
    title && `Title: ${title}`,
    description && `Description: ${description}`,
    headings.length && `Headings:\n- ${headings.join("\n- ")}`,
    bodyText && `Body excerpt: ${bodyText}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { title, description, headings, summary, raw: html };
}
