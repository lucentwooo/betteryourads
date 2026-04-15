import Anthropic from "@anthropic-ai/sdk";
import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";

const client = new Anthropic();

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
  screenshotPath: string
): Promise<VisionBrandColors | null> {
  const prepared = await prepareHeroCrop(screenshotPath);
  if (!prepared) {
    console.error("[brand-vision] could not prepare crop at", screenshotPath);
    return null;
  }

  const prompt = `You're a brand designer looking at a homepage screenshot. Return the real brand palette as JSON. NO PROSE.

Shape:
{
  "primary":    "#RRGGBB",
  "secondary":  "#RRGGBB",
  "accent":     "#RRGGBB",
  "background": "#RRGGBB",
  "text":       "#RRGGBB",
  "confidence": "high" | "medium" | "low"
}

Rules:
- Look at the actual pixels. Ignore generic defaults.
- "primary" is almost always the CTA button color or dominant brand accent — NOT black/white unless the brand is genuinely monochrome.
- If the hero is a dark photo with a colored button, primary = the button color, background = the section behind / surrounding the photo.
- Return 6-digit lowercase hex only.
- No commentary, no markdown fences. JSON object only.`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
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
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[brand-vision] no JSON in response:", raw.slice(0, 200));
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as VisionBrandColors;
    const hex = /^#[0-9a-f]{6}$/i;
    if (
      !hex.test(parsed.primary) ||
      !hex.test(parsed.background) ||
      !hex.test(parsed.text)
    ) {
      console.error("[brand-vision] bad hex in response:", parsed);
      return null;
    }
    // Normalize to lowercase
    parsed.primary = parsed.primary.toLowerCase();
    parsed.secondary = parsed.secondary?.toLowerCase() || parsed.primary;
    parsed.accent = parsed.accent?.toLowerCase() || parsed.primary;
    parsed.background = parsed.background.toLowerCase();
    parsed.text = parsed.text.toLowerCase();
    return parsed;
  } catch (err) {
    console.error("[brand-vision] API call failed", err);
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
