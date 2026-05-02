/**
 * breakdownAd — takes one Meta ad image and returns a structured StyleBreakdown.
 *
 * Implementation notes:
 * - Uses chatVision (OpenRouter → Gemini 2.5 Flash) which is cheap (~$0.001
 *   per call) and has solid OCR + composition reasoning for ads.
 * - We download the image and base64 it ourselves because chatVision's
 *   contract is base64. Larger payload than a URL but the model gets the
 *   bytes deterministically.
 * - One retry on parse failure with a sharper "JSON only" nudge — vision
 *   models occasionally drop into markdown.
 */
import { chatVision } from "@/lib/ai/openrouter";
import { extractJson } from "@/lib/agents/shared";
import {
  STYLE_BREAKDOWN_SYSTEM_PROMPT,
  buildBreakdownUserPrompt,
} from "./prompt";
import { validateBreakdown, type StyleBreakdown, type BreakdownContext } from "./schema";

export type { StyleBreakdown, BreakdownContext };

const MAX_BYTES = 6 * 1024 * 1024;

async function fetchAsBase64(
  imageUrl: string,
): Promise<{ base64: string; mediaType: string }> {
  const res = await fetch(imageUrl, {
    headers: { "user-agent": "betteryourads-style-engine/1.0" },
  });
  if (!res.ok) {
    throw new Error(`Image fetch failed: HTTP ${res.status} for ${imageUrl}`);
  }
  const mediaType =
    res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    throw new Error(
      `Image too large (${(buf.byteLength / 1024 / 1024).toFixed(1)}MB > 6MB)`,
    );
  }
  return { base64: buf.toString("base64"), mediaType };
}

export async function breakdownAd(
  imageUrl: string,
  context: BreakdownContext = {},
): Promise<StyleBreakdown> {
  const { base64, mediaType } = await fetchAsBase64(imageUrl);
  const userPrompt =
    STYLE_BREAKDOWN_SYSTEM_PROMPT +
    "\n\n---\n\n" +
    buildBreakdownUserPrompt(context);

  const tryOnce = async (extraNudge?: string): Promise<StyleBreakdown | null> => {
    const text = await chatVision({
      base64,
      mediaType,
      prompt: extraNudge ? `${userPrompt}\n\n${extraNudge}` : userPrompt,
      maxTokens: 2000,
      timeoutMs: 90_000,
    });
    const parsed = extractJson<Record<string, unknown>>(text);
    if (!parsed) return null;
    return validateBreakdown(parsed);
  };

  const first = await tryOnce();
  if (first) return first;

  const second = await tryOnce(
    "Your previous answer either wasn't valid JSON or was missing required fields. Return JSON only — no prose, no markdown fences. All required top-level keys must be present.",
  );
  if (second) return second;

  throw new Error(
    "Style breakdown failed validation after retry — vision model returned malformed JSON",
  );
}
