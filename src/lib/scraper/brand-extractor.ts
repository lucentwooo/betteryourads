import { type Page } from "puppeteer-core";
import { launchBrowser } from "./browser";
import type { BrandProfile } from "../types";

interface RawBrandData {
  colors: Record<string, string>;
  candidateBrandColors: string[];
  fonts: Record<string, { family: string; weight: string; size: string }>;
  logoSrc: string | null;
  cssVars: Record<string, string>;
  mode: "light" | "dark" | "mixed";
  ctaStyles: {
    backgroundColor: string;
    color: string;
    borderRadius: string;
  } | null;
}

export async function extractBrandFromPage(
  page: Page
): Promise<{ raw: RawBrandData; profile: Omit<BrandProfile, "dosAndDonts"> }> {
  const rawData = await page.evaluate(() => {
    const getComputed = (el: Element | null, prop: string) =>
      el ? getComputedStyle(el).getPropertyValue(prop).trim() : "";

    const isTransparent = (c: string) => {
      if (!c) return true;
      if (c === "transparent") return true;
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return false;
      const parts = m[1].split(",").map((v) => parseFloat(v.trim()));
      if (parts.length === 4 && parts[3] === 0) return true;
      return false;
    };

    const parseRgb = (c: string): [number, number, number] | null => {
      const m = c.match(/\d+(\.\d+)?/g);
      if (!m || m.length < 3) return null;
      return [Number(m[0]), Number(m[1]), Number(m[2])];
    };

    const saturation = (r: number, g: number, b: number) => {
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max === 0) return 0;
      return (max - min) / max;
    };

    // Walk body up to html for first non-transparent background
    const effectiveBg = (start: Element | null): string => {
      let el: Element | null = start;
      while (el) {
        const c = getComputed(el, "background-color");
        if (!isTransparent(c)) return c;
        el = el.parentElement;
      }
      return "rgb(255,255,255)";
    };

    const body = document.body;
    const header =
      document.querySelector("header") ||
      document.querySelector("nav") ||
      document.querySelector('[class*="header"]');
    const hero =
      document.querySelector('[class*="hero"]') ||
      document.querySelector("main > section:first-child") ||
      document.querySelector("main > div:first-child") ||
      document.querySelector("section:first-of-type");
    const h1 = document.querySelector("h1");
    const h2 = document.querySelector("h2");
    const bodyText = document.querySelector("p");

    const colors: Record<string, string> = {};
    colors.bodyBg = effectiveBg(body);
    colors.bodyText = getComputed(body, "color");
    if (header && !isTransparent(getComputed(header, "background-color"))) {
      colors.headerBg = getComputed(header, "background-color");
    }
    if (hero && !isTransparent(getComputed(hero, "background-color"))) {
      colors.heroBg = getComputed(hero, "background-color");
    }
    if (h1) colors.headingColor = getComputed(h1, "color");

    // Harvest candidate brand colors by walking all visible buttons/links in
    // the first viewport. Any non-grayscale, non-transparent background is a
    // strong signal — these are what users perceive as "the brand color".
    const candidates: { color: string; sat: number; area: number; y: number }[] = [];
    const viewportH = window.innerHeight;
    const interactive = Array.from(
      document.querySelectorAll("a, button, [role='button'], [class*='btn'], [class*='cta'], [class*='Button']")
    );
    for (const el of interactive) {
      const rect = el.getBoundingClientRect();
      if (rect.top > viewportH * 1.5) continue; // above / just below fold
      if (rect.width < 32 || rect.height < 16) continue;
      const bg = getComputed(el, "background-color");
      if (isTransparent(bg)) continue;
      const rgb = parseRgb(bg);
      if (!rgb) continue;
      const sat = saturation(rgb[0], rgb[1], rgb[2]);
      if (sat < 0.25) continue; // skip near-grayscale
      candidates.push({
        color: bg,
        sat,
        area: rect.width * rect.height,
        y: rect.top,
      });
    }
    // Sort: most saturated, then largest
    candidates.sort((a, b) => b.sat * 0.7 + Math.log(1 + b.area) * 0.3 - (a.sat * 0.7 + Math.log(1 + a.area) * 0.3));

    const ctaEl = candidates[0]
      ? interactive.find((el) => getComputed(el, "background-color") === candidates[0].color)
      : null;
    if (ctaEl) {
      colors.ctaBg = getComputed(ctaEl, "background-color");
      colors.ctaText = getComputed(ctaEl, "color");
    }

    const candidateBrandColors = Array.from(new Set(candidates.map((c) => c.color))).slice(0, 5);

    // Fonts
    const fonts: Record<string, { family: string; weight: string; size: string }> = {};
    if (h1) fonts.heading = {
      family: getComputed(h1, "font-family"),
      weight: getComputed(h1, "font-weight"),
      size: getComputed(h1, "font-size"),
    };
    if (h2) fonts.subheading = {
      family: getComputed(h2, "font-family"),
      weight: getComputed(h2, "font-weight"),
      size: getComputed(h2, "font-size"),
    };
    if (bodyText) fonts.body = {
      family: getComputed(bodyText, "font-family"),
      weight: getComputed(bodyText, "font-weight"),
      size: getComputed(bodyText, "font-size"),
    };

    const cssVars: Record<string, string> = {};
    const rootStyles = getComputedStyle(document.documentElement);
    const sheet = document.styleSheets;
    for (let i = 0; i < sheet.length; i++) {
      try {
        const rules = sheet[i].cssRules;
        for (let j = 0; j < rules.length; j++) {
          const rule = rules[j] as CSSStyleRule;
          if (rule.selectorText === ":root") {
            for (let k = 0; k < rule.style.length; k++) {
              const prop = rule.style[k];
              if (prop.startsWith("--")) {
                cssVars[prop] = rootStyles.getPropertyValue(prop).trim();
              }
            }
          }
        }
      } catch {
        // cross-origin
      }
    }

    const logoEl =
      document.querySelector('header img[src*="logo"], header img[alt*="logo"], nav img[src*="logo"], nav img[alt*="logo"]') ||
      document.querySelector('header img, nav img') ||
      document.querySelector('img[class*="logo"]') ||
      document.querySelector('header svg, nav svg');
    let logoSrc: string | null = null;
    if (logoEl instanceof HTMLImageElement) logoSrc = logoEl.src;
    else if (logoEl instanceof SVGElement) logoSrc = "svg-inline";

    // Mode: sample hero background if present, else body
    const bgToSample = colors.heroBg || colors.bodyBg;
    const rgbSample = parseRgb(bgToSample) || [255, 255, 255];
    const luminance =
      (0.299 * rgbSample[0] + 0.587 * rgbSample[1] + 0.114 * rgbSample[2]) / 255;
    const mode: "light" | "dark" = luminance > 0.5 ? "light" : "dark";

    let ctaStyles = null;
    if (ctaEl) {
      ctaStyles = {
        backgroundColor: getComputed(ctaEl, "background-color"),
        color: getComputed(ctaEl, "color"),
        borderRadius: getComputed(ctaEl, "border-radius"),
      };
    }

    return {
      colors,
      candidateBrandColors,
      fonts,
      cssVars,
      logoSrc,
      mode,
      ctaStyles,
    };
  });

  const profile = buildBrandProfile(rawData);
  return { raw: rawData, profile };
}

function rgbToHex(rgb: string): string | null {
  if (!rgb) return null;
  if (rgb === "transparent") return null;
  const match = rgb.match(/\d+(\.\d+)?/g);
  if (!match || match.length < 3) return null;
  const [r, g, b, a] = match.map(Number);
  if (a !== undefined && a === 0) return null;
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function cleanFontFamily(family: string): string {
  return family.split(",")[0].replace(/['"]/g, "").trim();
}

function buildBrandProfile(
  raw: RawBrandData
): Omit<BrandProfile, "dosAndDonts"> {
  const firstCandidate = raw.candidateBrandColors[0]
    ? rgbToHex(raw.candidateBrandColors[0])
    : null;
  const secondCandidate = raw.candidateBrandColors[1]
    ? rgbToHex(raw.candidateBrandColors[1])
    : null;

  // Primary: saturated CTA / brand candidate; fall back to heading color, then ink.
  const primary =
    rgbToHex(raw.colors.ctaBg || "") ||
    firstCandidate ||
    rgbToHex(raw.colors.headingColor || "") ||
    "#1A1915";

  const background = rgbToHex(raw.colors.bodyBg || "") || "#FFFFFF";
  const text = rgbToHex(raw.colors.bodyText || "") || "#1A1915";
  const secondary =
    secondCandidate ||
    rgbToHex(raw.colors.headerBg || "") ||
    background;
  const accent =
    rgbToHex(raw.colors.heroBg || "") ||
    firstCandidate ||
    primary;

  let corners = "rounded";
  if (raw.ctaStyles) {
    const radius = parseInt(raw.ctaStyles.borderRadius);
    if (radius === 0) corners = "sharp";
    else if (radius >= 20) corners = "pill";
    else if (radius >= 8) corners = "rounded";
    else corners = "slightly-rounded";
  }

  const headingFont = raw.fonts.heading
    ? cleanFontFamily(raw.fonts.heading.family)
    : "System";
  const bodyFont = raw.fonts.body
    ? cleanFontFamily(raw.fonts.body.family)
    : headingFont;

  return {
    colors: { primary, secondary, accent, background, text },
    typography: {
      primary: headingFont,
      secondary: headingFont !== bodyFont ? bodyFont : undefined,
      headingWeight: raw.fonts.heading
        ? parseInt(raw.fonts.heading.weight) || 700
        : 700,
      bodyWeight: raw.fonts.body
        ? parseInt(raw.fonts.body.weight) || 400
        : 400,
    },
    visualStyle: {
      mode: raw.mode,
      ctaShape: raw.ctaStyles ? `${corners} button` : "unknown",
      corners,
      aesthetic: inferAesthetic(raw),
    },
    tone: "to-be-determined",
    logoUrl: raw.logoSrc || undefined,
  };
}

function inferAesthetic(raw: RawBrandData): string {
  const parts: string[] = [];
  parts.push(raw.mode === "dark" ? "dark-mode" : "light-mode");

  const headingFont = raw.fonts.heading?.family?.toLowerCase() || "";
  if (headingFont.includes("mono") || headingFont.includes("code")) parts.push("developer-focused");
  else if (headingFont.includes("serif") && !headingFont.includes("sans")) parts.push("editorial");
  else parts.push("modern");

  const headingWeight = parseInt(raw.fonts.heading?.weight || "700");
  if (headingWeight >= 800) parts.push("bold");
  else if (headingWeight <= 400) parts.push("minimal");

  return parts.join(", ");
}

export async function extractBrandFromUrl(
  url: string
): Promise<{ raw: RawBrandData; profile: Omit<BrandProfile, "dosAndDonts"> }> {
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1500));
    return await extractBrandFromPage(page);
  } finally {
    await browser.close();
  }
}
