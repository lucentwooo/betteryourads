import type { CreativeCopy, DiagnosisResult } from "../types";
import {
  MODEL_HUMANIZE,
  createTextMessage,
  extractJson,
  findBannedPhrases,
  HARD_BAN_PHRASES,
} from "./shared";

/**
 * Final-pass agent. The cheap stack (Kimi/DeepSeek/Flash) drafts the
 * facts; this agent rewrites the prose in a sharp human marketing-
 * strategist voice using Sonnet 4.6. Called once per concept's copy and
 * once for the diagnosis. Cheap to run because the input is already
 * concise.
 *
 * Failure mode: if Sonnet errors or returns garbage, fall back to the
 * cheap-model output. Never block the pipeline on the polish pass.
 */

const SKIP = process.env.SKIP_HUMANIZER === "1";

const VOICE_PROMPT = `You rewrite ad copy + diagnosis prose so it sounds like a sharp, human marketing strategist wrote it. Not a SaaS blog. Not LinkedIn. Closer to the Stripe blog or a senior partner's Slack message.

HARD RULES:
- Keep facts identical. Don't invent stats, brand names, or claims.
- Keep length similar. Don't pad. If the input is tight, keep it tight.
- Cut filler: "really", "very", "essentially", "in order to", "at the end of the day".
- Active voice over passive. Specific over abstract. Verb-first sentences when it lands.
- NEVER use any of these phrases: ${HARD_BAN_PHRASES.join(", ")}.
- NEVER use the structure "It's not X, it's Y" or "It's not just X — it's Y".
- No emoji. No exclamation marks. No em-dash overuse.
- Don't start sentences with "Imagine", "Picture this", "What if".
- Don't use "as a [role]", "in today's", "leverage", "harness".

Return ONLY valid JSON in the exact shape requested. No prose, no fences.`;

/* ─────────── Copy humanizer ─────────── */

export async function humanizeCopy(
  copy: CreativeCopy,
  conceptName: string,
): Promise<CreativeCopy> {
  if (SKIP) return copy;
  if (!copy.headline && !copy.primary) return copy;

  const userPrompt = `Rewrite this Meta ad copy in a sharp human voice. Match or beat the character limits.

Concept: ${conceptName}

Input:
{
  "primary": ${JSON.stringify(copy.primary)},
  "headline": ${JSON.stringify(copy.headline)},
  "description": ${JSON.stringify(copy.description)},
  "cta": ${JSON.stringify(copy.cta)}
}

Char limits (strict): primary <= 125, headline <= 40, description <= 30, cta = 2-4 words.

Return JSON only:
{
  "primary": "...",
  "headline": "...",
  "description": "...",
  "cta": "..."
}`;

  try {
    const msg = await createTextMessage({
      model: MODEL_HUMANIZE,
      max_tokens: 800,
      system: VOICE_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });
    const text = msg.content[0].type === "text" ? msg.content[0].text : "";
    const parsed = extractJson<{
      primary?: string;
      headline?: string;
      description?: string;
      cta?: string;
    }>(text);
    if (!parsed) return copy;

    const next: CreativeCopy = {
      primary: (parsed.primary || copy.primary).trim(),
      headline: (parsed.headline || copy.headline).trim(),
      description: (parsed.description || copy.description).trim(),
      cta: (parsed.cta || copy.cta).trim(),
      vocLanguageUsed: copy.vocLanguageUsed,
    };

    // Reject and fall back if the polish reintroduced a banned phrase or
    // blew through char limits — this is a polish pass, not a rewrite.
    const allText = `${next.primary} ${next.headline} ${next.description} ${next.cta}`;
    if (findBannedPhrases(allText).length > 0) return copy;
    if (next.primary.length > 125) return copy;
    if (next.headline.length > 40) return copy;
    if (next.description.length > 30) return copy;

    return next;
  } catch (err) {
    console.warn("[humanizer] copy fallback:", err instanceof Error ? err.message : err);
    return copy;
  }
}

/* ─────────── Diagnosis humanizer ─────────── */

const DIAGNOSIS_FIELDS = [
  "tldr",
  "executiveSummary",
  "doingWell",
  "notWorking",
  "competitorWins",
  "missingOpportunities",
] as const;

type HumanizableField = (typeof DIAGNOSIS_FIELDS)[number];

export async function humanizeDiagnosis(
  diagnosis: DiagnosisResult,
): Promise<DiagnosisResult> {
  if (SKIP) return diagnosis;

  // Build a single payload of all fields. One round-trip is cheaper and
  // keeps voice consistent across sections.
  const input: Record<HumanizableField, string> = {
    tldr: diagnosis.tldr || "",
    executiveSummary: diagnosis.executiveSummary || "",
    doingWell: diagnosis.doingWell || "",
    notWorking: diagnosis.notWorking || "",
    competitorWins: diagnosis.competitorWins || "",
    missingOpportunities: diagnosis.missingOpportunities || "",
  };

  const userPrompt = `Rewrite each of these diagnosis sections in a sharp human voice. Keep markdown bullets/headings if present. Keep [voc:PatternName] markers verbatim. Keep numbers and brand names exact.

${DIAGNOSIS_FIELDS.map((f) => `### ${f}\n${input[f]}`).join("\n\n")}

Return JSON only with the same keys:
{
  "tldr": "...",
  "executiveSummary": "...",
  "doingWell": "...",
  "notWorking": "...",
  "competitorWins": "...",
  "missingOpportunities": "..."
}`;

  try {
    const msg = await createTextMessage(
      {
        model: MODEL_HUMANIZE,
        max_tokens: 4000,
        system: VOICE_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      },
      { timeout: 90_000 },
    );
    const text = msg.content[0].type === "text" ? msg.content[0].text : "";
    const parsed = extractJson<Record<HumanizableField, string>>(text);
    if (!parsed) return diagnosis;

    const next: DiagnosisResult = { ...diagnosis };
    for (const f of DIAGNOSIS_FIELDS) {
      const v = (parsed[f] || "").trim();
      if (!v) continue;
      // Reject if banned phrases reintroduced for this field; keep original.
      if (findBannedPhrases(v).length > 0) continue;
      next[f] = v;
    }
    return next;
  } catch (err) {
    console.warn("[humanizer] diagnosis fallback:", err instanceof Error ? err.message : err);
    return diagnosis;
  }
}
