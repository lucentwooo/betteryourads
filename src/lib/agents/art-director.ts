import type { Concept, CreativeCopy, DenseNarrativePrompt, BrandProfile, VisualRegister, Track } from "../types";
import { MODEL_REASON, runWithQA, judgeWithRubric, extractJson, createTextMessage } from "./shared";
import { selectReferences, type ReferenceAd } from "../references/loader";
import { chatText } from "../ai/openrouter";

/* ───────── Business-type domain hints ─────────
 * Each business type maps to a short product-domain description plus a
 * must-not-have list that the prompt writer is told to filter every prop,
 * subject, and setting through. This is the primary lever against the
 * "tennis racket on a healthcare ad" failure mode — domain coherence is
 * enforced at write-time, not just caught after the fact by QA. */

const DOMAIN_HINTS: Record<
  string,
  { domain: string; nativeProps: string; mustNotHave: string }
> = {
  "saas-b2b": {
    domain: "B2B SaaS — software bought by professionals to run their work",
    nativeProps:
      "laptop screens, dashboards, charts, app UI mockups, professionals at desks, teams in offices, clean product screenshots",
    mustNotHave:
      "consumer goods, food, sports equipment, pets, beach scenes, party imagery, lifestyle wellness props (powder pouches, supplements)",
  },
  "saas-b2c": {
    domain: "Consumer SaaS — software bought by individuals for their own use",
    nativeProps:
      "phone screens, app UI, individuals using the product on a device, simple lifestyle settings tied to the app's purpose",
    mustNotHave:
      "B2B enterprise imagery (boardrooms, suits), industrial equipment, sports gear unrelated to the app, food unless the app is food-related",
  },
  dtc: {
    domain:
      "DTC / consumer e-commerce — physical goods sold direct to the customer",
    nativeProps:
      "the product itself as hero, packaging, lifestyle imagery showing the product in use, clean studio shots",
    mustNotHave:
      "software UI, generic stock office imagery, props from unrelated product categories",
  },
  service: {
    domain: "Service / agency — expert work delivered to a client",
    nativeProps:
      "professionals in their environment, deliverables (reports, strategy docs, results), client-meeting imagery",
    mustNotHave:
      "consumer goods, food, sports equipment, pets unrelated to the service",
  },
  healthcare: {
    domain: "Healthcare — clinical or medical service",
    nativeProps:
      "doctors, clinicians, scrubs, hospital/clinic environments, medical equipment, charts and clinical UI",
    mustNotHave:
      "sports equipment, pets, food, beach/vacation imagery, casual lifestyle props",
  },
};

function domainHintFor(businessType?: string): string {
  if (!businessType) return "";
  const key = businessType.toLowerCase().trim();
  const hint = DOMAIN_HINTS[key];
  if (!hint) {
    // Generic fallback when the business_type is something we don't have
    // a curated entry for — still tells the model to filter through the
    // brand's actual product domain.
    return `Brand domain: ${businessType}. Every prop, subject, and setting must be obviously native to this domain. References are for COMPOSITION and PALETTE only — never copy literal props from them.`;
  }
  return `Brand domain: ${hint.domain}.
Native props/subjects/settings for this domain: ${hint.nativeProps}.
Must NOT include: ${hint.mustNotHave}.
References are for COMPOSITION and PALETTE only — never copy literal props or subjects from them.`;
}

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
    /** Brand's business type (saas-b2b, dtc, healthcare, etc). When set,
     * the prompt writer is told to filter every prop, subject, and setting
     * through this domain — the primary defence against off-domain drift
     * from static references (e.g. AG1 lifestyle props on a healthcare ad). */
    businessType?: string;
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
    qa: async (p) =>
      promptQA(p, {
        brand: params.brandProfile,
        companyName: params.companyName,
        concept: params.concept,
        businessType: params.businessType,
      }),
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

async function promptQA(
  p: DenseNarrativePrompt,
  ctx: { brand?: BrandProfile; companyName?: string; concept?: Concept; businessType?: string },
) {
  const hardFails: string[] = [];
  const raw = p.raw || {};
  const brand = ctx.brand;

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

  // Brand-fit semantic check — catches off-domain props that slip through
  // when stylistic references (e.g. AG1 wellness lifestyle) bleed into a
  // brand they don't belong to (e.g. tennis racket on a healthcare ad).
  if (ctx.companyName && ctx.concept) {
    const fit = await brandFitCheck(raw, ctx.companyName, ctx.concept, brand, ctx.businessType);
    if (!fit.fits) {
      hardFails.push(`off-brand: ${fit.reason}`);
    }
  }

  if (hardFails.length > 0) {
    return {
      pass: false,
      score: 3,
      issues: hardFails,
      feedbackForRetry: `Fix: ${hardFails.slice(0, 6).join(" | ")}. Every required field populated. Cite >= 2 patterns. Include every brand hex code verbatim. If "off-brand" appears, remove the offending prop/subject/setting and replace with something obviously native to the brand's product world.`,
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
7. DOMAIN COHERENCE — every visible prop, subject, and environment element must be obviously native to the brand's product domain (provided in the brief). References below are for COMPOSITION and PALETTE only — never copy literal props, subjects, or settings from them. If a reference shows a tennis player but the brand sells healthcare software, take the framing and lighting, not the racket. Add the brief's "must NOT include" items to negative_prompt verbatim.

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

  const domainHint = domainHintFor(params.businessType);
  const domainBlock = domainHint ? `\nDOMAIN (HIGHEST PRIORITY — read before anything else):\n${domainHint}\n` : "";

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
${domainBlock}
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

Reference ads (COMPOSITION + PALETTE only — do NOT copy props, subjects, or settings if they violate the domain rules above):
${referenceBlock}

${feedback ? `\nQA RETRY: ${feedback}\n` : ""}

Return JSON now.`;
}


/* ───────── Brand-fit semantic check ─────────
 * Catches off-domain props (tennis racket on a healthcare ad, etc.) that
 * slip through when style references bleed into a brand they do not fit.
 * Cheap text-LLM call (~$0.0005) — runs once per generated prompt. */

async function brandFitCheck(
  raw: Record<string, unknown>,
  companyName: string,
  concept: Concept,
  brand?: BrandProfile,
  businessType?: string,
): Promise<{ fits: boolean; reason: string }> {
  const sceneSummary = [
    `Scene: ${String(raw.scene ?? "").slice(0, 400)}`,
    `Subject: ${JSON.stringify(raw.subject ?? "").slice(0, 400)}`,
    `Environment: ${JSON.stringify(raw.environment ?? "").slice(0, 250)}`,
  ].join("\n");

  const brandLine = brand?.tone ? `Tone: ${brand.tone}` : "";
  const domainLine = businessType ? `Business type: ${businessType}\nDomain rules: ${domainHintFor(businessType)}` : "";

  const userPrompt = `You are an ad reviewer. Your ONLY job is to spot OBVIOUSLY off-domain props that don't belong in this brand's ad. Be permissive. Stylistic choices are fine.

Brand: ${companyName}
Angle: ${concept.angle}
Awareness stage: ${concept.awarenessStage}
${brandLine}
${domainLine}

Proposed scene:
${sceneSummary}

Return strict JSON: {"fits": true|false, "reason": "one short sentence"}.

ONLY REJECT (fits=false) when the scene contains a CLEARLY off-domain literal prop that has nothing to do with the brand category. Examples of clear rejections:
- Tennis racket / sports equipment on a healthcare or fintech ad
- A pizza or cooked food on a software ad
- A surfboard or beach toy on an accounting or SaaS ad
- A pet/animal as the focal subject when the brand sells professional services

ACCEPT (fits=true) in all other cases, including:
- Stylistic palette/composition borrowed from another brand (this is intentional)
- Settings that set a mood (office, kitchen, outdoor, urban) — these are fine even if not literally the product
- Lifestyle imagery, professional people, abstract scenes
- Anything where you have to squint or argue to call it off-domain — default to ACCEPT

When in doubt, fits=true. Only reject when the off-domain prop is literally unmistakable.

Return JSON only.`;

  try {
    const text = await chatText(userPrompt, {
      maxTokens: 200,
      temperature: 0.1,
      timeoutMs: 30_000,
    });
    const parsed = extractJson<{ fits: boolean; reason: string }>(text);
    if (!parsed) return { fits: true, reason: "qa-parse-failed-allow" };
    return {
      fits: !!parsed.fits,
      reason: parsed.reason ?? "no reason given",
    };
  } catch (err) {
    // Fail-open — if the QA judge errors, do not block the pipeline.
    console.warn("[brandFitCheck] judge error, allowing through:", err);
    return { fits: true, reason: "judge-error-allow" };
  }
}
