import fs from "fs/promises";
import path from "path";
import type { Creative, BrandProfile } from "../types";
import { client, MODEL, runWithQA, judgeWithRubric } from "./shared";
import { KieClient } from "../imagegen/kie-client";
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

  const relativePath = path.relative(STORAGE_ROOT, output.localPath);
  return { imageUrl: output.imageUrl, localPath: output.localPath, relativePath, qa };
}

function buildKiePromptString(creative: Creative, feedback?: string): string {
  // Kie.ai accepts a single `prompt` string. We serialize the Dense Narrative
  // JSON as a readable briefing — Nano Banana 2 handles long prose prompts well.
  const raw = creative.prompt?.raw ?? {};
  const lines: string[] = [];

  if (raw.scene) lines.push(`Scene: ${raw.scene}`);
  if (raw.subject) lines.push(`Subject: ${JSON.stringify(raw.subject)}`);
  if (raw.environment) lines.push(`Environment: ${JSON.stringify(raw.environment)}`);
  if (raw.camera) lines.push(`Camera: ${JSON.stringify(raw.camera)}`);
  if (raw.lighting) lines.push(`Lighting: ${JSON.stringify(raw.lighting)}`);
  if (raw.color_palette) lines.push(`Color palette: ${JSON.stringify(raw.color_palette)}`);
  if (raw.composition) lines.push(`Composition: ${JSON.stringify(raw.composition)}`);
  if (raw.text_elements && creative.track === "A") {
    lines.push(`Text to render exactly: ${JSON.stringify(raw.text_elements)}`);
  }
  if (raw.style) lines.push(`Style: ${raw.style}`);
  if (raw.negative_prompt || creative.prompt?.negativePrompt) {
    lines.push(`Avoid: ${raw.negative_prompt || creative.prompt?.negativePrompt}`);
  }
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
    model: MODEL,
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
