/**
 * Deterministic brand-color extractor from raw HTML. Used as a true
 * last-resort fallback when both screenshot vision and og:image vision
 * fail. Doesn't need an LLM — pulls signals straight from the source:
 *
 * 1. <meta name="theme-color" content="#..."> — most reliable
 * 2. Manifest theme_color (if linked)
 * 3. CSS custom properties named --primary / --brand / --accent / etc.
 * 4. Frequency-weighted hex codes from inline styles, with the most-
 *    common non-grayscale color winning.
 *
 * Returns null if no usable brand color is found, so the caller can fall
 * back to the neutral default.
 */

import type { VisionBrandColors } from "./brand-vision";

const HEX = /#([0-9a-fA-F]{6})\b/g;
const HEX_SHORT = /#([0-9a-fA-F]{3})\b/g;

function expandShortHex(short: string): string {
  return `#${short[0]}${short[0]}${short[1]}${short[1]}${short[2]}${short[2]}`.toLowerCase();
}

function isGrayscale(hex: string): boolean {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return true;
  const [, r, g, b] = m;
  const rn = parseInt(r, 16);
  const gn = parseInt(g, 16);
  const bn = parseInt(b, 16);
  // Treat near-equal channels as grayscale (within 8/255).
  return Math.abs(rn - gn) <= 8 && Math.abs(gn - bn) <= 8 && Math.abs(rn - bn) <= 8;
}

function isExtreme(hex: string): boolean {
  const lower = hex.toLowerCase();
  return (
    lower === "#000000" ||
    lower === "#ffffff" ||
    lower === "#111111" ||
    lower === "#fafafa" ||
    lower === "#f5f5f5"
  );
}

function pickMetaThemeColor(html: string): string | null {
  const m = html.match(
    /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i,
  );
  if (!m) {
    // Some sites use the reverse attribute order
    const m2 = html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i,
    );
    if (!m2) return null;
    const c = m2[1].trim();
    return /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null;
  }
  const c = m[1].trim();
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(c)) return expandShortHex(c.slice(1));
  return null;
}

function pickCssVariableColor(html: string): string | null {
  // Matches --primary: #xxxxxx, --color-primary: #xxx, --brand-color: ...
  const varRegex =
    /--(?:color-)?(?:primary|brand|accent|main|theme)[a-z-]*\s*:\s*(#[0-9a-fA-F]{3,8})/gi;
  let m: RegExpExecArray | null;
  while ((m = varRegex.exec(html)) !== null) {
    const c = m[1].toLowerCase();
    if (c.length === 4) {
      const expanded = expandShortHex(c.slice(1));
      if (!isGrayscale(expanded) && !isExtreme(expanded)) return expanded;
    } else if (c.length === 7) {
      if (!isGrayscale(c) && !isExtreme(c)) return c;
    }
  }
  return null;
}

function frequencyWinner(html: string): string | null {
  const counts = new Map<string, number>();
  let m: RegExpExecArray | null;
  while ((m = HEX.exec(html)) !== null) {
    const c = `#${m[1].toLowerCase()}`;
    if (isGrayscale(c) || isExtreme(c)) continue;
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  while ((m = HEX_SHORT.exec(html)) !== null) {
    const expanded = expandShortHex(m[1]);
    if (isGrayscale(expanded) || isExtreme(expanded)) continue;
    counts.set(expanded, (counts.get(expanded) || 0) + 1);
  }
  if (counts.size === 0) return null;
  // Need at least 2 occurrences to be a real "brand" signal — singletons
  // are usually decorative one-offs.
  const winner = [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])[0];
  return winner ? winner[0] : null;
}

/** Build a partial palette from a single brand color. */
function paletteFromPrimary(primary: string): VisionBrandColors {
  return {
    primary,
    secondary: primary,
    accent: primary,
    background: "#ffffff",
    text: "#111111",
    confidence: "low",
  };
}

export function extractBrandColorsFromHtml(
  rawHtml: string,
): VisionBrandColors | null {
  if (!rawHtml || rawHtml.length < 200) return null;

  // Priority 1: meta theme-color
  const themeColor = pickMetaThemeColor(rawHtml);
  if (themeColor && !isGrayscale(themeColor) && !isExtreme(themeColor)) {
    return { ...paletteFromPrimary(themeColor), confidence: "medium" };
  }

  // Priority 2: CSS variables
  const cssVar = pickCssVariableColor(rawHtml);
  if (cssVar) return paletteFromPrimary(cssVar);

  // Priority 3: most-frequent saturated hex
  const winner = frequencyWinner(rawHtml);
  if (winner) return paletteFromPrimary(winner);

  return null;
}
