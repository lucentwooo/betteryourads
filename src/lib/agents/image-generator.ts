import fs from "fs/promises";
import path from "path";
import type { Creative, BrandProfile } from "../types";
import { client, MODEL_CHEAP, runWithQA, judgeWithRubric } from "./shared";
import { KieClient } from "../imagegen/kie-client";
import { putImage } from "../storage/image-store";
import { STORAGE_ROOT } from "../storage-root";

/**
 * Agent 6 — Art Director / Account Manager — image generator + multimodal QA.
 * Generates the PNG via Kie.ai Nano Banana 2. Claude (vision) then reads the
 * rendered image and scores readability, CTA presence, contrast, text
 * collision, and craft. 2 auto-retries with specific fix-feedback.
 */

const KIE_BASE_URL = "https://api.kie.ai";

export async function runImageGenerator(
  params: {
    creative: Creative;
    outputDir: string; // absolute path
    brandProfile?: BrandProfile;
  },
  onAgentProgress?: (msg: string) => Promise<void> | void,
): Promise<{ imageUrl: string; localPath: string; relativePath: string; qa: Awaited<ReturnType<typeof imageQA>> }> {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    throw new Error("KIE_API_KEY not set in environment");
  }

  const kie = new KieClient({ apiKey, baseUrl: KIE_BASE_URL });
  await fs.mkdir(params.outputDir, { recursive: true });

  const { output, qa, escalated } = await runWithQA({
    generatorName: "ImageGenerator",
    qaName: "ImageGenQA",
    maxRetries: 2,
    generate: async (feedback) => {
      await onAgentProgress?.(`Image Gen: "${params.creative.conceptId}"${feedback ? " (retry)" : ""}`);
      const promptString = buildKiePromptString(params.creative, feedback);
      const taskId = await kie.createTask({
        prompt: promptString,
        aspectRatio: "1:1",
        resolution: "1K",
        outputFormat: "png",
      });
      const imageUrl = await kie.pollForCompletion(taskId, {
        maxAttempts: 60,
        intervalMs: 4000,
        onProgress: () => {},
      });
      const localPath = path.join(params.outputDir, `${params.creative.id}.png`);
      await kie.downloadImage(imageUrl, localPath);
      return { imageUrl, localPath };
    },
    qa: async ({ localPath }) => imageQA(localPath, params.creative),
    onAttempt: async (attempt, outcome, q) => {
      await onAgentProgress?.(`Image QA ${outcome} (attempt ${attempt + 1}, score ${q.score}) — ${params.creative.id}`);
    },
  });

  if (escalated) {
    await onAgentProgress?.(`Image escalated for ${params.creative.id}: ${qa.issues.slice(0, 2).join("; ")}`);
  }

  // Upload the final PNG to Blob so the URL persists across cold starts.
  // The returned imageUrl is what the frontend renders; localPath stays
  // for any in-pipeline tooling that still needs filesystem access.
  const pngBuffer = await fs.readFile(output.localPath);
  const blobKey = path.posix.join(
    "jobs",
    path.basename(path.dirname(path.dirname(output.localPath))),
    "creatives",
    path.basename(output.localPath)
  );
  const persistedUrl = await putImage(blobKey, pngBuffer, "image/png");

  const relativePath = path.relative(STORAGE_ROOT, output.localPath);
  return { imageUrl: persistedUrl, localPath: output.localPath, relativePath, qa };
}

function buildKiePromptString(creative: Creative, feedback?: string): string {
  // Kie.ai accepts a single `prompt` string. We serialize the structured
  // JSON (json-prompt-generator schema) as a readable briefing in the order
  // the renderer attends to most: scene description first (the dense
  // paragraph that could stand alone), then style, technical, materials,
  // environment, composition, quality. Each section is JSON-stringified so
  // exact text and hex codes survive the conversion.
  const raw = (creative.prompt?.raw ?? {}) as Record<string, unknown>;
  const lines: string[] = [];
  const get = (key: string) => raw[key];

  const scene = get("scene") as Record<string, unknown> | string | undefined;
  if (scene) {
    if (typeof scene === "string") {
      lines.push(`Scene: ${scene}`);
    } else {
      const s = scene as Record<string, unknown>;
      if (s.description) lines.push(`Scene: ${s.description}`);
      if (s.subject) lines.push(`Subject: ${s.subject}`);
      if (s.setting) lines.push(`Setting: ${s.setting}`);
      if (s.action) lines.push(`Action: ${s.action}`);
    }
  }

  const style = get("style");
  if (style) lines.push(`Style: ${typeof style === "string" ? style : JSON.stringify(style)}`);

  const technical = get("technical");
  if (technical) lines.push(`Technical: ${JSON.stringify(technical)}`);

  const materials = get("materials");
  if (materials && Object.keys(materials as object).length > 0) {
    lines.push(`Materials: ${JSON.stringify(materials)}`);
  }

  const environment = get("environment");
  if (environment && Object.keys(environment as object).length > 0) {
    lines.push(`Environment: ${JSON.stringify(environment)}`);
  }

  const composition = get("composition") as Record<string, unknown> | undefined;
  if (composition) {
    const compForKie: Record<string, unknown> = { ...composition };
    if (creative.track === "B" && Array.isArray(compForKie.ui_elements)) {
      // Track B: keep zone metadata but blank out content so the model
      // doesn't try to render text. Sharp composites it after.
      compForKie.ui_elements = (compForKie.ui_elements as Array<Record<string, unknown>>).map((el) => ({
        ...el,
        content: "reserved empty zone — do NOT render any text here",
      }));
    }
    lines.push(`Composition: ${JSON.stringify(compForKie)}`);
  }

  const quality = get("quality");
  if (quality) lines.push(`Quality: ${JSON.stringify(quality)}`);

  // Legacy/back-compat — older prompts may still expose color_palette /
  // text_elements at the top level. Surface them so we don't silently lose
  // brand hex codes during the schema migration.
  const palette = get("color_palette");
  if (palette) lines.push(`Color palette: ${JSON.stringify(palette)}`);
  const legacyText = get("text_elements");
  if (legacyText && creative.track === "A") {
    lines.push(`Text to render exactly: ${JSON.stringify(legacyText)}`);
  }

  const neg = (raw.negative_prompt as string | undefined) || creative.prompt?.negativePrompt;
  if (neg) lines.push(`Avoid: ${neg}`);

  if (feedback) lines.push(`FIX FROM QA: ${feedback}`);

  return lines.join("\n");
}

/* ───────── Multimodal QA (Claude reads the PNG) ───────── */

async function imageQA(localPath: string, creative: Creative) {
  const buf = await fs.readFile(localPath);
  const b64 = buf.toString("base64");
  const mediaType = "image/png";

  const userPrompt = `You are reviewing a rendered Meta ad creative (1080x1080 PNG).

Source copy that should appear or be compositable:
  headline: "${creative.copy.headline}"
  primary: "${creative.copy.primary}"
  description: "${creative.copy.description}"
  cta: "${creative.copy.cta}"

Track: ${creative.track} (${creative.track === "A" ? "text should be rendered in-image" : "text zones should be left as negative space for Sharp composite"})

Evaluate strictly on these dimensions (1-10):
- readability: is the intended headline visible and legible at a 400px thumbnail? (Track B: is there a clear negative-space zone where headline will go?)
- ctaPresence: is there one clear visual action (Track A) or reserved CTA zone (Track B)?
- contrast: does text have sufficient contrast against its immediate background?
- noCollision: no overlapping text/element collisions, no text broken by background seams
- craft: design tension, layered composition, real pop-color, looks like a real brand ad not a template

Return ONLY JSON:
{
  "scores": {"readability": N, "ctaPresence": N, "contrast": N, "noCollision": N, "craft": N},
  "issues": ["specific issue 1", ...],
  "feedbackForRetry": "concrete visual change to request from the generator"
}

Pass requires EVERY score >= 7. Be strict — reject gibberish text, low contrast, template vibes.`;

  const msg = await client.messages.create({
    model: MODEL_CHEAP,
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } },
          { type: "text", text: userPrompt },
        ],
      },
    ],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return {
      pass: false,
      score: 0,
      issues: ["Image QA judge returned non-JSON"],
      feedbackForRetry: "Regenerate — QA parse failed.",
      retries: 0,
    };
  }
  try {
    const parsed = JSON.parse(match[0]) as {
      scores: Record<string, number>;
      issues: string[];
      feedbackForRetry: string;
    };
    const scores = Object.values(parsed.scores);
    const mean = scores.reduce((a, b) => a + b, 0) / Math.max(scores.length, 1);
    const minScore = Math.min(...scores);
    return {
      pass: minScore >= 7,
      score: Math.round(mean * 10) / 10,
      issues: parsed.issues || [],
      feedbackForRetry: parsed.feedbackForRetry || "",
      retries: 0,
      rubric: parsed.scores,
    };
  } catch {
    return {
      pass: false,
      score: 0,
      issues: ["Image QA judge JSON parse error"],
      feedbackForRetry: "Regenerate — JSON parse failed.",
      retries: 0,
    };
  }
}

// Re-export so the pipeline can use judgeWithRubric pattern uniformly.
export { judgeWithRubric };
