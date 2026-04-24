import type { Concept, CreativeCopy, VoiceOfCustomer, BrandProfile } from "../types";
import { client, MODEL, runWithQA, judgeWithRubric, extractJson, findBannedPhrases } from "./shared";

/**
 * Agent 4 — Copywriter.
 * Writes primary text / headline / description / CTA for one concept.
 * Uses VoC language where natural. Enforces char limits. Strict QA.
 */

const CHAR_LIMITS = {
  primary: 125,
  headline: 40,
  description: 30,
};

export async function runCopywriter(
  params: {
    concept: Concept;
    voc?: VoiceOfCustomer;
    brandProfile?: BrandProfile;
    companyName: string;
  },
  onAgentProgress?: (msg: string) => Promise<void> | void,
): Promise<CreativeCopy> {
  await onAgentProgress?.(`Copywriter agent: "${params.concept.name}"`);

  const { output, qa, escalated } = await runWithQA<CreativeCopy>({
    generatorName: "Copywriter",
    qaName: "CopyQA",
    generate: async (feedback) => {
      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 2000,
        system: copySystemPrompt,
        messages: [{ role: "user", content: buildCopyPrompt(params, feedback) }],
      });
      const text = msg.content[0].type === "text" ? msg.content[0].text : "";
      const parsed = extractJson<CreativeCopy>(text);
      if (!parsed) {
        return {
          primary: "",
          headline: "",
          description: "",
          cta: "",
          vocLanguageUsed: [],
        };
      }
      return {
        primary: (parsed.primary || "").trim(),
        headline: (parsed.headline || "").trim(),
        description: (parsed.description || "").trim(),
        cta: (parsed.cta || "").trim(),
        vocLanguageUsed: parsed.vocLanguageUsed || [],
      };
    },
    qa: async (copy) => copyQA(copy, params.concept, params.voc),
    onAttempt: async (attempt, outcome, q) => {
      await onAgentProgress?.(`Copy QA ${outcome} (attempt ${attempt + 1}, score ${q.score}) — ${params.concept.name}`);
    },
  });

  if (escalated) {
    await onAgentProgress?.(`Copy escalated for "${params.concept.name}": ${qa.issues.slice(0, 2).join("; ")}`);
  }
  return output;
}

async function copyQA(copy: CreativeCopy, concept: Concept, voc?: VoiceOfCustomer) {
  const hardFails: string[] = [];

  if (!copy.primary || copy.primary.length < 10) hardFails.push("primary missing or too short");
  if (!copy.headline) hardFails.push("headline missing");
  if (!copy.description) hardFails.push("description missing");
  if (!copy.cta) hardFails.push("cta missing");

  if (copy.primary.length > CHAR_LIMITS.primary) {
    hardFails.push(`primary ${copy.primary.length} chars (max ${CHAR_LIMITS.primary})`);
  }
  if (copy.headline.length > CHAR_LIMITS.headline) {
    hardFails.push(`headline ${copy.headline.length} chars (max ${CHAR_LIMITS.headline})`);
  }
  if (copy.description.length > CHAR_LIMITS.description) {
    hardFails.push(`description ${copy.description.length} chars (max ${CHAR_LIMITS.description})`);
  }

  const allText = `${copy.primary} ${copy.headline} ${copy.description} ${copy.cta}`;
  const banned = findBannedPhrases(allText);
  if (banned.length > 0) hardFails.push(`banned phrases: ${banned.join(", ")}`);

  // If VoC was provided, at least one quoted/adjacent phrase must appear
  if (voc && copy.vocLanguageUsed.length === 0) {
    hardFails.push("no vocLanguageUsed listed — surface which customer terminology was lifted");
  }

  if (hardFails.length > 0) {
    return {
      pass: false,
      score: 3,
      issues: hardFails,
      feedbackForRetry: `Fix: ${hardFails.join(" | ")}. Stay within char limits strictly. Use customer terminology from VoC verbatim where it fits.`,
      retries: 0,
    };
  }

  return judgeWithRubric({
    systemPrompt:
      "You are a strict direct-response copy reviewer. Reject generic, polished, AI-feeling copy. Prefer sharp, specific, human voice.",
    userPrompt: `Evaluate copy for concept "${concept.name}" (${concept.awarenessStage}, framework: ${concept.framework}):

primary (${copy.primary.length}): ${copy.primary}
headline (${copy.headline.length}): ${copy.headline}
description (${copy.description.length}): ${copy.description}
cta: ${copy.cta}
voc terms lifted: ${copy.vocLanguageUsed.join(", ")}`,
    rubric: ["specificity", "voice", "frameworkFit", "vocIntegration", "stopPower"],
    passThreshold: 7,
  });
}

const copySystemPrompt = `You are an elite direct-response copywriter writing Meta ad copy for SaaS founders.

HARD RULES:
- Return primary (<= 125 chars), headline (<= 40 chars), description (<= 30 chars), and cta (imperative, 2-4 words).
- Write in the founder's voice, not a brand voice. Specific > clever.
- Where natural, use the EXACT customer terminology from the VoC list (surface which in vocLanguageUsed).
- Match the concept's framework shape (e.g. Problem-Agitate-Solve starts with the problem).
- NEVER use: delve, leverage, robust, seamless, game-changer, unleash, harness, empower, revolutionize, "it's not X, it's Y".
- No emoji unless the brand voice explicitly supports it.
- No exclamation marks.

OUTPUT: JSON only.
{
  "primary": "...",
  "headline": "...",
  "description": "...",
  "cta": "...",
  "vocLanguageUsed": ["phrase lifted verbatim", "..."]
}`;

function buildCopyPrompt(
  params: Parameters<typeof runCopywriter>[0],
  feedback?: string,
): string {
  const c = params.concept;
  const vocLines = params.voc
    ? `
VoC language patterns (use verbatim where natural — list them in vocLanguageUsed):
${params.voc.languagePatterns.map((p) => `  - "${p.name}": ${p.description}`).join("\n")}
Pain patterns to echo:
${params.voc.painPoints.map((p) => `  - "${p.name}": ${p.description}`).join("\n")}
Direct quotes you may adapt:
${params.voc.snippets.slice(0, 8).map((s) => `  - "${s.quote}"`).join("\n")}
`
    : "";

  return `Write Meta ad copy for concept: "${c.name}" for ${params.companyName}.

Concept:
- Awareness stage: ${c.awarenessStage}
- Framework: ${c.framework}
- Angle: ${c.angle}
- Rationale: ${c.rationale}
- VoC patterns this concept is built on: ${c.vocPatternRefs.join(", ")}

Brand tone: ${params.brandProfile?.tone || "(not supplied)"}
${vocLines}

${feedback ? `\nQA RETRY: ${feedback}\n` : ""}

Return JSON now.`;
}
