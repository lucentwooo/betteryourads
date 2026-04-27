import type { Concept, CreativeCopy, DenseNarrativePrompt, BrandProfile, VisualRegister, Track } from "../types";
import { MODEL_REASON, runWithQA, judgeWithRubric, extractJson, createTextMessage } from "./shared";
import { selectReferences, type ReferenceAd } from "../references/loader";

/**
 * Agent 5 — Art Director (Prompt Writer).
 * Picks register + track, fetches reference ads from the library, writes a
 * Dense Narrative JSON prompt for Kie.ai grounded in proven patterns.
 * QA enforces schema completeness, brand hex fidelity, and pattern citation.
 */

const REQUIRED_FIELDS = [
  "scene",
  "subject",
  "environment",
  "camera",
  "lighting",
  "color_palette",
  "composition",
  "text_elements",
  "style",
  "negative_prompt",
];

export async function runArtDirector(
  params: {
    concept: Concept;
    copy: CreativeCopy;
    brandProfile?: BrandProfile;
    companyName: string;
  },
  onAgentProgress?: (msg: string) => Promise<void> | void,
): Promise<{ register: VisualRegister; track: Track; prompt: DenseNarrativePrompt; references: ReferenceAd[] }> {
  await onAgentProgress?.(`Art Director agent: "${params.concept.name}"`);

  // Step 1: pick register + track (quick planning call).
  const plan = await pickRegisterAndTrack(params);
  await onAgentProgress?.(
    `Art Director: ${params.concept.name} → ${plan.register}, track ${plan.track}`,
  );

  // Step 2: fetch closest reference ads from the library.
  const references = await selectReferences({
    register: plan.register,
    awarenessStage: params.concept.awarenessStage,
    max: 3,
  });

  // Step 3: write the Dense Narrative JSON prompt with QA gate.
  const { output, qa, escalated } = await runWithQA<DenseNarrativePrompt>({
    generatorName: "ArtDirector",
    qaName: "PromptQA",
    generate: async (feedback) => {
      const msg = await createTextMessage({
        model: MODEL_REASON,
        max_tokens: 6000,
        system: promptSystemPrompt,
        messages: [
          {
            role: "user",
            content: buildPromptWriterPrompt({ ...params, ...plan, references }, feedback),
          },
        ],
      });
      const text = msg.content[0].type === "text" ? msg.content[0].text : "";
      const parsed = extractJson<{ raw: Record<string, unknown>; negative_prompt: string; patterns_cited: string[] }>(text);
      if (!parsed) {
        return {
          raw: {},
          negativePrompt: "",
          patternsCited: [],
          referenceAds: references.map((r) => r.key),
        };
      }
      return {
        raw: parsed.raw || (parsed as unknown as Record<string, unknown>),
        negativePrompt: parsed.negative_prompt || "",
        patternsCited: parsed.patterns_cited || [],
        referenceAds: references.map((r) => r.key),
      };
    },
    qa: async (p) => promptQA(p, params.brandProfile),
    onAttempt: async (attempt, outcome, q) => {
      await onAgentProgress?.(
        `Prompt QA ${outcome} (attempt ${attempt + 1}, score ${q.score}) — ${params.concept.name}`,
      );
    },
  });

  if (escalated) {
    await onAgentProgress?.(`Prompt escalated for "${params.concept.name}": ${qa.issues.slice(0, 2).join("; ")}`);
  }

  return {
    register: plan.register,
    track: plan.track,
    prompt: output,
    references,
  };
}

/* ───────── Register + Track decision ───────── */

async function pickRegisterAndTrack(
  params: Parameters<typeof runArtDirector>[0],
): Promise<{ register: VisualRegister; track: Track; justification: string }> {
  const msg = await createTextMessage({
    model: MODEL_REASON,
    max_tokens: 400,
    system: `You decide visual register + Track (A = full-bake text-in-image, B = image-only + Sharp composite for text).
Pick one register from: editorial, product-first, lifestyle, documentary, meme, testimonial, comparison.
Track A is cleaner when text is short + background is simple. Track B is safer when copy is long or placement-critical.
Return JSON only.`,
    messages: [
      {
        role: "user",
        content: `Concept: ${params.concept.name} (${params.concept.awarenessStage}, framework: ${params.concept.framework})
Angle: ${params.concept.angle}
Headline length: ${params.copy.headline.length} chars
Primary: ${params.copy.primary}

Return:
{"register": "editorial"|"product-first"|"lifestyle"|"documentary"|"meme"|"testimonial"|"comparison",
 "track": "A"|"B",
 "justification": "one sentence"}`,
      },
    ],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const parsed = extractJson<{ register: VisualRegister; track: Track; justification: string }>(text);
  if (!parsed) {
    return { register: "editorial", track: "B", justification: "default fallback" };
  }
  return parsed;
}

/* ───────── QA ───────── */

async function promptQA(p: DenseNarrativePrompt, brand?: BrandProfile) {
  const hardFails: string[] = [];
  const raw = p.raw || {};

  for (const f of REQUIRED_FIELDS) {
    if (raw[f] === undefined || raw[f] === null || raw[f] === "") {
      hardFails.push(`missing field "${f}"`);
    }
  }

  if (!p.negativePrompt || p.negativePrompt.length < 20) {
    hardFails.push("negative_prompt missing or too short");
  }

  if ((p.patternsCited || []).length < 2) {
    hardFails.push(`only ${p.patternsCited?.length || 0} patterns cited (need >= 2)`);
  }

  // Brand hex fidelity — every brand color should appear in the prompt
  if (brand) {
    const text = JSON.stringify(raw).toLowerCase();
    for (const [role, hex] of Object.entries(brand.colors)) {
      if (!hex || typeof hex !== "string") continue;
      const h = hex.toLowerCase();
      if (!text.includes(h)) {
        hardFails.push(`brand color ${role}=${h} missing from prompt`);
      }
    }
  }

  if (hardFails.length > 0) {
    return {
      pass: false,
      score: 3,
      issues: hardFails,
      feedbackForRetry: `Fix: ${hardFails.slice(0, 6).join(" | ")}. Every required field populated. Cite >= 2 patterns. Include every brand hex code verbatim.`,
      retries: 0,
    };
  }

  return judgeWithRubric({
    systemPrompt: "You are a strict creative prompt reviewer for ad image generation. Reject vague, under-specified prompts.",
    userPrompt: `Evaluate Dense Narrative prompt:
Scene: ${String(raw.scene || "").slice(0, 300)}
Composition: ${JSON.stringify(raw.composition || {}).slice(0, 400)}
Color palette: ${JSON.stringify(raw.color_palette || []).slice(0, 300)}
Text elements: ${JSON.stringify(raw.text_elements || []).slice(0, 300)}
Patterns cited: ${p.patternsCited.join(", ")}`,
    rubric: ["schemaCompleteness", "textSpecs", "brandFidelity", "patternCitation", "negativePromptCoverage"],
    passThreshold: 7,
  });
}

/* ───────── Prompts ───────── */

const promptSystemPrompt = `You are an elite art director writing Dense Narrative JSON prompts for Kie.ai Nano Banana 2.

HARD RULES:
1. Every required field populated: scene, subject, environment, camera, lighting, color_palette (array of {hex, role, coverage_pct}), composition (layout_archetype, focal_points, negative_space_pct, vertical_zones), text_elements (array of {content, font, size, position, color, weight}), style, negative_prompt.
2. Cite >= 2 patterns from the reference ad library's _patterns.md. List them in patterns_cited.
3. Every brand hex code must appear verbatim in color_palette or elsewhere in the prompt.
4. For Track A: specify EVERY visible text element with position, font weight, size, and color. Headline must be clearly the dominant element.
5. For Track B: keep text zones as negative space — no text to be rendered by the model.
6. negative_prompt includes baseline ("no gibberish text, no distorted faces, no tiny text, no watermarks") plus ad-specific rejections.

OUTPUT: JSON only. Shape:
{
  "raw": {
    "scene": "...",
    "subject": {...},
    "environment": {...},
    "camera": {...},
    "lighting": {...},
    "color_palette": [{"hex": "#...", "role": "...", "coverage_pct": 30}, ...],
    "composition": {"layout_archetype": "...", "focal_points": [...], "negative_space_pct": 30, "vertical_zones": [...]},
    "text_elements": [{"content": "...", "font": "...", "weight": 800, "size_px": "...", "position": "...", "color_hex": "#..."}],
    "style": "...",
    "negative_prompt": "..."
  },
  "negative_prompt": "...",
  "patterns_cited": ["CP-N: pattern name", ...]
}`;

function buildPromptWriterPrompt(
  params: Parameters<typeof runArtDirector>[0] & {
    register: VisualRegister;
    track: Track;
    references: ReferenceAd[];
  },
  feedback?: string,
): string {
  const referenceBlock = params.references
    .map(
      (r) =>
        `— ${r.key} (${r.brand}, ${r.awarenessStage}, register "${r.register}")
  Prompt excerpt: ${JSON.stringify(r.promptJson).slice(0, 800)}
  Analysis excerpt: ${r.analysisMd.slice(0, 400)}`,
    )
    .join("\n\n");

  const brandBlock = params.brandProfile
    ? `
Brand:
  Colors: ${Object.entries(params.brandProfile.colors).map(([k, v]) => `${k}=${v}`).join(", ")}
  Typography: ${params.brandProfile.typography.primary} (heading weight ${params.brandProfile.typography.headingWeight})
  CTA shape: ${params.brandProfile.visualStyle.ctaShape}
  Aesthetic: ${params.brandProfile.visualStyle.aesthetic}
  Tone: ${params.brandProfile.tone}
  Do: ${params.brandProfile.dosAndDonts.do.join("; ")}
  Don't: ${params.brandProfile.dosAndDonts.dont.join("; ")}
`
    : "";

  return `Write a Dense Narrative JSON prompt for this ad.

Concept: ${params.concept.name} — ${params.concept.awarenessStage} stage, ${params.concept.framework}
Angle: ${params.concept.angle}

Copy that must appear (this is the source of truth — text_elements must match):
  headline: "${params.copy.headline}"
  primary: "${params.copy.primary}"
  description: "${params.copy.description}"
  cta: "${params.copy.cta}"

Visual register: ${params.register}
Track: ${params.track} (${params.track === "A" ? "FULL-BAKE — render all text in-image, surgical specs required" : "IMAGE-ONLY — leave text zones empty, Sharp will composite text after"})
${brandBlock}

Reference ads to model structure on (replace content, keep composition + register):
${referenceBlock}

${feedback ? `\nQA RETRY: ${feedback}\n` : ""}

Return JSON now.`;
}
