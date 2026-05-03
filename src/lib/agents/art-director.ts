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

/* The new schema mirrors the json-prompt-generator skill exactly, adapted
 * for ads. Every field is "be specific, not generic" — the LLM is told to
 * describe what it sees rather than reach for impressive-sounding clichés. */
const REQUIRED_TOP_LEVEL = ["scene", "style", "technical", "composition", "quality"] as const;

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

  for (const f of REQUIRED_TOP_LEVEL) {
    if (raw[f] === undefined || raw[f] === null || raw[f] === "") {
      hardFails.push(`missing field "${f}"`);
    }
  }

  // scene.description is the most important single field — must be a real paragraph
  const scene = (raw.scene as Record<string, unknown> | undefined) ?? {};
  const description = typeof scene.description === "string" ? scene.description : "";
  if (description.length < 200) {
    hardFails.push(`scene.description too short (${description.length} chars, need >= 200)`);
  }
  if (/\b(natural lighting|professional photography|high quality|cinematic)\b/i.test(description) && description.length < 400) {
    // Lazy generic phrasing without the specificity to back it up.
    hardFails.push("scene.description leans on generic phrases ('natural lighting', 'professional photography') — be specific instead");
  }

  // technical.camera must have aperture + focal_length per the skill rules
  const technical = (raw.technical as Record<string, unknown> | undefined) ?? {};
  const camera = (technical.camera as Record<string, unknown> | undefined) ?? {};
  if (!camera.focal_length || !camera.aperture) {
    hardFails.push("technical.camera.focal_length and .aperture are required (e.g., 35mm + f/2.8)");
  }

  // quality.include + avoid + reference_standard are non-negotiable per the skill
  const quality = (raw.quality as Record<string, unknown> | undefined) ?? {};
  const include = Array.isArray(quality.include) ? quality.include : [];
  const avoid = Array.isArray(quality.avoid) ? quality.avoid : [];
  if (include.length < 6) {
    hardFails.push(`quality.include needs 8-12 image-specific keywords (got ${include.length})`);
  }
  if (avoid.length < 5) {
    hardFails.push(`quality.avoid needs 6-10 image-specific failure modes (got ${avoid.length})`);
  }
  if (!quality.reference_standard || typeof quality.reference_standard !== "string") {
    hardFails.push("quality.reference_standard must cite a real photographer / publication / film / design system");
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
    systemPrompt: "You are a strict creative prompt reviewer for ad image generation. Reject vague, under-specified prompts. Reward specificity (exact f-stops, named lighting directions, real-photographer references) and reject generic phrasing.",
    userPrompt: `Evaluate the JSON prompt:
scene.description: ${description.slice(0, 600)}
style: ${JSON.stringify(raw.style || {}).slice(0, 400)}
technical.camera: ${JSON.stringify(camera).slice(0, 300)}
materials: ${JSON.stringify(raw.materials || {}).slice(0, 400)}
composition.ui_elements: ${JSON.stringify((raw.composition as Record<string, unknown> | undefined)?.ui_elements || {}).slice(0, 400)}
quality.include: ${JSON.stringify(include).slice(0, 300)}
quality.avoid: ${JSON.stringify(avoid).slice(0, 300)}
quality.reference_standard: ${quality.reference_standard ?? "(missing)"}
patterns_cited: ${p.patternsCited.join(", ")}`,
    rubric: ["sceneDescriptionRichness", "cameraSpecificity", "materialRealism", "uiElementsExactText", "qualityArrayPrecision", "referenceStandardCredibility"],
    passThreshold: 7,
  });
}

/* ───────── Prompts ───────── */

const promptSystemPrompt = `You are an elite art director writing structured JSON prompts for Kie.ai Nano Banana 2. Your job is to produce a prompt so specific and visually grounded that the renderer cannot fall back to generic AI-photo aesthetics.

CORE PRINCIPLES (these determine quality — follow closely):

1. BE SPECIFIC, NOT GENERIC. "Warm golden-hour sunlight raking across the subject at 15 degrees from camera-left" beats "natural lighting." "Visible pores, fine wrinkles around the eyes, slight stubble shadow on the jaw" beats "realistic skin." Precision is what makes the output usable.

2. SEPARATE VISUAL ELEMENTS. Every distinct surface, person, or object gets its own description with materials, lighting interaction, and spatial relationship. Don't blur subject and setting into one paragraph.

3. CAMERA SETTINGS MUST BE REALISTIC AND MATCH THE LOOK.
   - Very blurry background → f/1.4–f/2.0
   - Moderately soft background → f/2.8–f/4
   - Most things sharp → f/5.6–f/8
   - Everything sharp → f/11–f/16
   - Compressed perspective / telephoto feel → 85mm–200mm
   - Normal perspective → 50mm
   - Wide / environmental → 24mm–35mm
   - Exaggerated foreground → 16mm–24mm

4. EVERY VISIBLE TEXT ELEMENT IS SPELLED OUT EXACTLY in composition.ui_elements — character-for-character, with font style, weight, colour hex, alignment, and position. Don't paraphrase headlines.

5. QUALITY ARRAYS ARE NON-NEGOTIABLE. quality.include needs 8–12 keywords specific to THIS image. quality.avoid needs 6–10 failure modes specific to THIS image. quality.reference_standard cites real photographers, publications, films, or design systems whose visual language matches (e.g. "Annie Leibovitz Vanity Fair editorial portrait", "Apple Vision Pro launch keynote stills", "Linear marketing site product hero").

6. OMIT IRRELEVANT SECTIONS. A studio product shot doesn't need environment.atmosphere. A landscape with no people doesn't need materials.skin. A clean software UI shot doesn't need particles. Padding with generic filler reduces quality.

7. DOMAIN COHERENCE. Every prop, subject, and setting must be obviously native to the brand's product domain (provided in the brief). References are for COMPOSITION and PALETTE only — never copy literal props or subjects from them. If a reference shows a tennis player but the brand sells healthcare software, take the framing and lighting, not the racket. The brief's "must NOT include" items go into quality.avoid verbatim.

8. BRAND HEX CODES appear verbatim somewhere in the prompt — typically inside scene.description and inside composition.ui_elements colour fields.

9. TRACK GATING.
   - Track A (full-bake): every visible text element is described in composition.ui_elements with exact text, font, weight, colour hex, alignment, and position. Headline is clearly the dominant element.
   - Track B (image-only): composition.ui_elements describes empty zones reserved for text composite — no text rendered by the model.

OUTPUT: a single valid JSON object. Shape (omit subsections that aren't relevant — don't pad):

{
  "raw": {
    "scene": {
      "description": "ONE DENSE PARAGRAPH (4-8 sentences) that could stand alone as a complete image prompt. Covers subject, action, setting, mood, dominant colour palette (with hex codes for branded content), and ALL typography/UI elements with exact text. This is the most important field in the whole prompt.",
      "subject": "Primary subject with specific physical details — pose, clothing, expression, object specifics",
      "setting": "Location, environment, context, period if relevant",
      "action": "What is happening, or 'static' with description"
    },
    "style": {
      "primary": "photorealistic | cinematic | documentary | editorial | commercial | illustrated | [specific style]",
      "rendering_quality": "hyperrealistic | detailed | high-resolution | stylized",
      "surface_textures": "Dominant texture treatment across the scene",
      "lighting": "Direction (e.g. 'camera-left at 30 degrees'), quality (hard/soft/diffused), colour temperature (e.g. 5600K daylight, 3200K tungsten warm), number of sources, how light interacts with the scene"
    },
    "technical": {
      "camera": {
        "focal_length": "exact mm — 24mm, 35mm, 50mm, 85mm, 100mm macro, etc.",
        "aperture": "exact f-stop — f/1.4, f/2.0, f/2.8, f/4, f/5.6, f/8, f/11",
        "depth_of_field": "very shallow | shallow | moderate | deep — plus what's sharp vs soft",
        "angle": "eye level | low angle | high angle | overhead | three-quarter overhead | dutch | [specific]"
      },
      "resolution": "high definition | ultra high definition | cinema-grade | editorial print quality",
      "rendering": "Shutter character, grain, colour depth, bokeh quality, post-processing look"
    },
    "materials": {
      "skin": "(only if people present) Pore detail, natural imperfections, ethnicity, jewellery, facial hair",
      "fabric": "(only if fabric present) Weave/thread patterns, drape, wear, weight",
      "surfaces": "Each distinct surface — scratches, patina, oxidation, irregularities",
      "transparency": "(only if transparent elements present) Refraction, glass, liquid behaviour"
    },
    "environment": {
      "atmosphere": "(only if environmental) Haze, fog, humidity, volumetric light",
      "time": "(only if environmental) Time of day, season, light mix",
      "particles": "(only if environmental) Dust, moisture, smoke, steam"
    },
    "composition": {
      "perspective": "Vanishing points, depth layering, leading lines",
      "framing": "rule of thirds | golden ratio | centered | symmetrical | split layout | [describe]",
      "subject_placement": "Precise positioning, visual weight distribution, eye path",
      "ui_elements": [
        {
          "role": "headline | subhead | cta | body | logo | badge | label | reserved_zone",
          "content": "EXACT text character-for-character (or 'reserved empty zone' for Track B)",
          "font": "specific family, e.g. 'Inter Display Black' or 'serif italic display'",
          "weight": 900,
          "size_relative": "dominant | large | medium | small | micro",
          "alignment": "left | center | right",
          "position": "top-left | top-center | top-right | center | bottom-left | bottom-center | bottom-right | [precise]",
          "color_hex": "#RRGGBB"
        }
      ]
    },
    "quality": {
      "include": ["8-12 positive keywords specific to THIS image"],
      "avoid": ["6-10 failure modes specific to THIS image (must include the brief's must-not-have items verbatim)"],
      "reference_standard": "Real photographers / publications / films / design systems whose visual language matches"
    },
    "negative_prompt": "Final flat negative-prompt string for renderers that consume one. Concatenates the brief's must-not items + craft failure modes."
  },
  "negative_prompt": "Same as raw.negative_prompt — surfaced at the top level for downstream serialization.",
  "patterns_cited": ["CP-N: pattern name from the reference library", ...]
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

  return `Write a structured JSON prompt for one Meta ad creative. Follow the schema and core principles in the system prompt EXACTLY. The single most important field is scene.description — write it as a dense paragraph that could stand alone as a complete image prompt.
${domainBlock}
Concept: ${params.concept.name} — ${params.concept.awarenessStage} stage, ${params.concept.framework}
Angle: ${params.concept.angle}

Copy that must appear (source of truth — composition.ui_elements must match exactly, character-for-character):
  headline: "${params.copy.headline}"
  primary: "${params.copy.primary}"
  description: "${params.copy.description}"
  cta: "${params.copy.cta}"

Visual register: ${params.register}
Track: ${params.track} ${
    params.track === "A"
      ? "(FULL-BAKE — every text element rendered in-image with exact specs in composition.ui_elements)"
      : "(IMAGE-ONLY — composition.ui_elements describes empty reserved zones; Sharp will composite text after)"
  }
${brandBlock}

Reference ads (USE FOR COMPOSITION + LIGHTING + PALETTE ONLY — never copy literal props, subjects, or settings if they violate the domain rules above):
${referenceBlock}

ANALYSIS APPROACH:
Before you start writing the JSON, mentally answer:
- What is the single subject the viewer's eye should land on first? Describe it with the kind of physical specificity a casting director would use.
- What is the lighting doing? Direction, quality, colour temperature, hard or soft.
- What camera setup matches that look? Pick aperture and focal length per the rules above.
- What materials are visible? For each distinct surface, what makes it look real (pores, weave, scratches, patina)?
- What real photographer / publication / film does this remind you of? That goes in quality.reference_standard.
- What are 6-10 specific failure modes for THIS image (not generic "blurry, bad quality")? Those go in quality.avoid.

${feedback ? `\nQA RETRY — fix this: ${feedback}\n` : ""}

Return ONLY the JSON object, no preamble.`;
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
