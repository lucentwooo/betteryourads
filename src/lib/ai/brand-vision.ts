import Anthropic from "@anthropic-ai/sdk";
import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";
import { chatVision } from "./openrouter";

const client = new Anthropic();

function parseVisionJson(raw: string): VisionBrandColors | null {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  let parsed: VisionBrandColors;
  try {
    parsed = JSON.parse(jsonMatch[0]) as VisionBrandColors;
  } catch {
    return null;
  }
  const hex = /^#[0-9a-f]{6}$/i;
  if (
    !hex.test(parsed.primary) ||
    !hex.test(parsed.background) ||
    !hex.test(parsed.text)
  ) {
    return null;
  }
  parsed.primary = parsed.primary.toLowerCase();
  parsed.secondary = parsed.secondary?.toLowerCase() || parsed.primary;
  parsed.accent = parsed.accent?.toLowerCase() || parsed.primary;
  parsed.background = parsed.background.toLowerCase();
  parsed.text = parsed.text.toLowerCase();
  return parsed;
}

export interface VisionBrandColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  confidence: "high" | "medium" | "low";
}

/**
 * Crop the above-the-fold region from a full-page screenshot and compress
 * it so Claude can actually read it. Full-page marketing screenshots run
 * 5–30 MB; we cap to 1440×1600 webp ~300 KB for vision calls.
 */
async function prepareHeroCrop(screenshotPath: string): Promise<{ base64: string; mediaType: "image/webp" } | null> {
  try {
    const meta = await sharp(screenshotPath).metadata();
    const width = meta.width || 1440;
    const cropHeight = Math.min(meta.height || 1600, 1600);
    const buffer = await sharp(screenshotPath)
      .extract({ left: 0, top: 0, width, height: cropHeight })
      .resize({ width: 1280, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    return { base64: buffer.toString("base64"), mediaType: "image/webp" };
  } catch (err) {
    console.error("[brand-vision] crop failed, falling back to raw read", err);
    try {
      const raw = await fs.readFile(screenshotPath);
      const ext = path.extname(screenshotPath).replace(".", "").toLowerCase();
      // Raw path — still try, but only if reasonably small
      if (raw.length > 4 * 1024 * 1024) return null;
      return {
        base64: raw.toString("base64"),
        mediaType: (ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/webp") as "image/webp",
      };
    } catch {
      return null;
    }
  }
}

/**
 * Ask Claude to look at a homepage screenshot and return the real brand
 * palette as hex codes. Used as the primary source on marketing sites —
 * CSS extraction often misses colors that live in photos, CSS-in-JS, or
 * background-image heroes.
 */
export async function extractBrandColorsFromScreenshot(
  screenshotPath: string,
  opts: { cheap?: boolean } = {},
): Promise<VisionBrandColors | null> {
  const prepared = await prepareHeroCrop(screenshotPath);
  if (!prepared) {
    console.error("[brand-vision] could not prepare crop at", screenshotPath);
    return null;
  }

  const prompt = `You're a senior brand designer. Return the REAL brand palette from this homepage screenshot as JSON. NO PROSE.

Shape:
{
  "primary":    "#RRGGBB",
  "secondary":  "#RRGGBB",
  "accent":     "#RRGGBB",
  "background": "#RRGGBB",
  "text":       "#RRGGBB",
  "confidence": "high" | "medium" | "low"
}

Order of evidence (use in this priority):
1. The LOGO — if the logo is black on white, primary is black. If it's a specific color, primary is that color.
2. The PRIMARY CTA BUTTON (the one most prominently styled — usually "Sign up", "Get started", "Try free"). Its fill color is a strong primary signal.
3. Navigation link color and body-text color → that's likely "text".
4. The page-background (large flat area, not hero imagery) → "background".
5. Only then consider hero decorations / gradients / illustrations — these are usually NOT the core brand palette.

HARD RULES:
- MANY great brands are intentionally monochrome (Linear, Stripe, Vercel early, Cal.com, Notion-ish). If the logo + nav + CTA are all black/white/grey, return a black-and-white palette with confidence "high". Do not invent a color from a background gradient.
- A colorful hero gradient ≠ brand color. Ignore animated/decorative gradients unless they are clearly on the logo or CTA.
- "accent" = the secondary splash color used on icons/highlights. If there is no accent, repeat primary. Do not fabricate.
- Return 6-digit lowercase hex only. No commentary, no markdown fences. JSON object only.`;

  try {
    if (opts.cheap) {
      const raw = await chatVision({
        base64: prepared.base64,
        mediaType: prepared.mediaType,
        prompt,
        maxTokens: 400,
      });
      const parsed = parseVisionJson(raw);
      if (!parsed) {
        console.error(
          "[brand-vision] cheap-mode no/invalid JSON:",
          raw.slice(0, 200),
        );
      }
      return parsed;
    }

    const message = await client.messages.create({
      // Haiku 4.5 is multimodal and plenty smart for reading hex codes
      // off a homepage screenshot — save tokens vs Sonnet.
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: prepared.mediaType,
                data: prepared.base64,
              },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    });

    const raw =
      message.content[0].type === "text" ? message.content[0].text : "";
    const parsed = parseVisionJson(raw);
    if (!parsed) {
      console.error("[brand-vision] no/invalid JSON:", raw.slice(0, 200));
    }
    return parsed;
  } catch (err) {
    console.error("[brand-vision] API call failed", err);
    return null;
  }
}

/**
 * Vision extraction from a remote image URL (e.g. og:image). Used when we
 * don't have a local screenshot — fast fetch + vision call, no chromium.
 * Returns null if the URL can't be fetched or Claude rejects it.
 */
export async function extractBrandColorsFromUrl(
  imageUrl: string,
  opts: { cheap?: boolean } = {},
): Promise<VisionBrandColors | null> {
  let buffer: Buffer;
  let mediaType = "image/png";
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 10_000);
    try {
      const res = await fetch(imageUrl, { signal: ac.signal });
      if (!res.ok) return null;
      const ct = res.headers.get("content-type") || "";
      if (ct.startsWith("image/")) mediaType = ct.split(";")[0];
      const arr = await res.arrayBuffer();
      if (arr.byteLength > 4 * 1024 * 1024) return null;
      buffer = Buffer.from(arr);
    } finally {
      clearTimeout(t);
    }
  } catch {
    return null;
  }

  // Claude vision accepts jpeg/png/webp/gif
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowed.includes(mediaType)) {
    try {
      buffer = await sharp(buffer).webp({ quality: 82 }).toBuffer();
      mediaType = "image/webp";
    } catch {
      return null;
    }
  }

  const prompt = `Return the brand palette from this image as JSON only.
{"primary":"#RRGGBB","secondary":"#RRGGBB","accent":"#RRGGBB","background":"#RRGGBB","text":"#RRGGBB","confidence":"high"|"medium"|"low"}
6-digit lowercase hex. No prose. If monochrome, return black/white honestly.`;

  try {
    if (opts.cheap) {
      const raw = await chatVision({
        base64: buffer.toString("base64"),
        mediaType,
        prompt,
        maxTokens: 300,
      });
      return parseVisionJson(raw);
    }

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType as "image/png",
                data: buffer.toString("base64"),
              },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    });
    const raw =
      message.content[0].type === "text" ? message.content[0].text : "";
    return parseVisionJson(raw);
  } catch (err) {
    console.error("[brand-vision] URL-based vision failed:", err);
    return null;
  }
}

/** Legacy detector — still exported but unused by new flow. Kept for callers. */
export function paletteLooksBroken(colors: {
  primary: string;
  secondary: string;
  accent: string;
  background?: string;
}): boolean {
  const grayscale = (hex: string) => {
    const m = hex?.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!m) return true;
    const [, r, g, b] = m;
    const rn = parseInt(r, 16);
    const gn = parseInt(g, 16);
    const bn = parseInt(b, 16);
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    if (max === 0) return true;
    return (max - min) / max < 0.15;
  };
  return (
    grayscale(colors.primary) &&
    grayscale(colors.secondary) &&
    grayscale(colors.accent)
  );
}
