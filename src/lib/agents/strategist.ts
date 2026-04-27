import type { DiagnosisResult, BrandProfile, AdScreenshot, CompetitorData, VoiceOfCustomer, VocPatternRef } from "../types";
import { MODEL_REASON, runWithQA, judgeWithRubric, findBannedPhrases, createTextMessage, type ModelMode } from "./shared";

/**
 * Agent 2 — Strategist.
 * VoC-aware 8-area diagnosis. Strictest QA gate in the pipeline.
 * 2 auto-retries. On 3rd fail, escalates to user with visible issues.
 */

export async function runStrategist(
  params: {
    companyName: string;
    companyUrl: string;
    websiteContent: string;
    landingPageContent?: string;
    productDescription?: string;
    icpDescription?: string;
    brandProfile?: Omit<BrandProfile, "dosAndDonts">;
    companyAds?: AdScreenshot[];
    companyAdCount?: number;
    companyVideoCount?: number;
    companyImageCount?: number;
    competitors: CompetitorData[];
    notes?: string;
    adContentDescription?: string;
    voc?: VoiceOfCustomer;
    modelMode?: ModelMode;
  },
  onAgentProgress?: (msg: string) => Promise<void> | void,
): Promise<DiagnosisResult> {
  await onAgentProgress?.("Strategist agent: running 8-area diagnosis");

  const { output, qa, escalated } = await runWithQA<DiagnosisResult>({
    generatorName: "Strategist",
    qaName: "DiagnosisQA",
    maxRetries: params.modelMode === "cheap" ? 1 : 2,
    generate: async (feedback) => {
      const userPrompt = buildDiagnosisUserPrompt(params, feedback);
      const msg = await createTextMessage({
        model: MODEL_REASON,
        max_tokens: 8000,
        system: diagnosisSystemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }, { timeout: params.modelMode === "cheap" ? 220_000 : 90_000 }, params.modelMode);
      const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
      return parseDiagnosis(raw, params.voc);
    },
    qa: async (d) => diagnosisQA(d, params.voc, params.modelMode),
    onAttempt: async (attempt, outcome, qa) => {
      await onAgentProgress?.(
        `Diagnosis QA ${outcome} (attempt ${attempt + 1}, score ${qa.score})`,
      );
    },
  });

  output.qa = { ...qa, retries: qa.retries };
  if (escalated) {
    await onAgentProgress?.(`Diagnosis escalated: ${qa.issues.slice(0, 2).join("; ")}`);
  }
  return output;
}

/* ───────── Parser ───────── */

function parseDiagnosis(raw: string, voc?: VoiceOfCustomer): DiagnosisResult {
  const sections: Record<string, string> = {};
  const sectionPattern = /^##\s+(.+?)$/gm;
  const matches: { title: string; index: number }[] = [];

  let match: RegExpExecArray | null;
  while ((match = sectionPattern.exec(raw)) !== null) {
    matches.push({ title: match[1].trim(), index: match.index });
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i].title.length + 3;
    const end = i + 1 < matches.length ? matches[i + 1].index : raw.length;
    sections[matches[i].title.toLowerCase()] = raw.slice(start, end).trim();
  }

  const find = (key: string): string => {
    const entry = Object.entries(sections).find(([k]) =>
      k.toLowerCase().includes(key.toLowerCase()),
    );
    return entry ? entry[1] : "";
  };

  // Extract VoC references — look for [voc:PatternName] markers
  const vocReferences: VocPatternRef[] = [];
  if (voc) {
    const refPattern = /\[voc:([^\]]+)\]/g;
    let m: RegExpExecArray | null;
    const seen = new Set<string>();
    while ((m = refPattern.exec(raw)) !== null) {
      const name = m[1].trim();
      if (seen.has(name)) continue;
      seen.add(name);
      const allPatterns = [
        ...voc.painPoints,
        ...voc.desires,
        ...voc.objections,
        ...voc.languagePatterns,
      ];
      const matched = allPatterns.find((p) => p.name === name);
      if (matched && matched.snippetRefs[0] !== undefined) {
        const snippet = voc.snippets[matched.snippetRefs[0]];
        if (snippet) {
          vocReferences.push({
            patternName: name,
            quote: snippet.quote,
            source: snippet.source,
            url: snippet.url,
          });
        }
      }
    }
  }

  return {
    tldr: find("tl;dr") || find("tldr"),
    executiveSummary: find("executive summary"),
    brandProfile: find("brand profile"),
    doingWell: find("doing well"),
    notWorking: find("not working"),
    competitorWins: find("competitors are doing") || find("competitor wins"),
    missingOpportunities: find("missing opportunit"),
    awarenessStageAnalysis: find("awareness stage"),
    recommendedConcepts: find("recommended next-test") || find("recommended concept"),
    testPlan: find("suggested test plan") || find("test plan"),
    raw,
    vocReferences,
  };
}

/* ───────── QA ───────── */

async function diagnosisQA(d: DiagnosisResult, voc?: VoiceOfCustomer, modelMode?: ModelMode) {
  const hardFails: string[] = [];

  // All 8 areas present
  const required: (keyof DiagnosisResult)[] = [
    "tldr",
    "executiveSummary",
    "doingWell",
    "notWorking",
    "competitorWins",
    "missingOpportunities",
    "awarenessStageAnalysis",
    "recommendedConcepts",
  ];
  for (const f of required) {
    if (!d[f] || (typeof d[f] === "string" && (d[f] as string).length < 40)) {
      hardFails.push(`Section "${f}" missing or too short`);
    }
  }

  // Banned phrases
  const banned = findBannedPhrases(d.raw);
  if (banned.length > 0) hardFails.push(`Banned phrases: ${banned.join(", ")}`);

  // VoC integration — scale the requirement to what VoC actually delivered.
  // If VoC gave 0 snippets, the diagnosis can't cite what isn't there.
  if (voc && voc.snippets.length >= 8) {
    const refCount = d.vocReferences?.length ?? 0;
    if (refCount < 2) {
      hardFails.push(
        `Only ${refCount} VoC pattern references in diagnosis (need >= 2 with [voc:PatternName] markers)`,
      );
    }
  }

  if (hardFails.length > 0) {
    return {
      pass: false,
      score: 3,
      issues: hardFails,
      feedbackForRetry: `Strict fixes required: ${hardFails.join(" | ")}. Use [voc:PatternName] inline markers to cite VoC patterns alongside findings. Reach >= 3 citations. Remove banned phrases. Ensure every section has substantive content.`,
      retries: 0,
    };
  }

  return judgeWithRubric({
    systemPrompt:
      "You are the strictest QA reviewer for ad strategy diagnosis. You reject generic, hedgey, or AI-flavored output.",
    userPrompt: `Evaluate this diagnosis:

TL;DR: ${d.tldr}

Doing well: ${d.doingWell.slice(0, 400)}
Not working: ${d.notWorking.slice(0, 400)}
Competitor wins: ${d.competitorWins.slice(0, 400)}
Missing opportunities: ${d.missingOpportunities.slice(0, 400)}
Awareness stage analysis: ${d.awarenessStageAnalysis.slice(0, 400)}
Recommended concepts: ${d.recommendedConcepts.slice(0, 400)}

VoC references cited: ${d.vocReferences?.length ?? 0}
Example VoC cited: ${d.vocReferences?.slice(0, 2).map((r) => `${r.patternName} — "${r.quote.slice(0, 80)}"`).join(" | ") ?? "(none)"}`,
    rubric: [
      "specificity",
      "frameworkCoverage",
      "languageQuality",
      "hedging",
      "vocIntegration",
    ],
    passThreshold: 7,
    modelMode,
  });
}

/* ───────── Prompts ───────── */

const diagnosisSystemPrompt = `You are an elite Meta-ads strategist diagnosing a company's creative. You write like a sharp, senior growth partner, not a SaaS content blog.

REQUIREMENTS:
- Use the 8-section structure below, each as "## <section>".
- Every claim ties to specific evidence: scraped site copy, competitor ads, or VoC snippets.
- When citing a VoC pattern, use the inline marker [voc:PatternName] immediately after the claim it supports. Use at least 3 distinct markers across the diagnosis.
- Use awareness stages: Unaware, Problem, Solution, Product, Most.
- Hedged language ("likely", "appears", "signals") — never definitive.
- Be specific. Name brands, URL fragments, numbers, exact phrases you see.
- NEVER use: "delve", "leverage", "robust", "seamless", "game-changer", "unleash", "harness", "empower", "revolutionize", "it's not X, it's Y" structure.
- Voice: direct, confident, occasionally blunt. No corporate softening.

STRUCTURE (every ## heading required):
## TL;DR
One hard-hitting paragraph. The single most important thing this company is missing.

## Executive Summary
3-5 tight bullets summarizing the diagnosis.

## Brand Profile
What the brand stands for and how it shows up visually and verbally.

## Doing Well
Specific wins from their current ads or positioning.

## Not Working
Specific failures, grounded in what you see.

## Competitor Wins
What competitors are printing money with, with named angles.

## Missing Opportunities
Angles/stages/VoC language they're leaving on the table.

## Awareness Stage Analysis
Which stages are over/under-represented. Cite examples.

## Recommended Next-Test Concepts
4-6 concept sketches (name + stage + angle + why). These feed the Concept Architect.

## Suggested Test Plan
Order, priority, budget framing.`;

function buildDiagnosisUserPrompt(
  params: Parameters<typeof runStrategist>[0],
  feedback?: string,
): string {
  const vocBlock = params.voc
    ? `

VOICE OF CUSTOMER (use [voc:PatternName] markers to cite these):
Pain points:
${params.voc.painPoints.map((p) => `  - ${p.name}: ${p.description}`).join("\n")}
Desires:
${params.voc.desires.map((p) => `  - ${p.name}: ${p.description}`).join("\n")}
Objections:
${params.voc.objections.map((p) => `  - ${p.name}: ${p.description}`).join("\n")}
Language patterns (customer terminology):
${params.voc.languagePatterns.map((p) => `  - ${p.name}: ${p.description}`).join("\n")}

Sample direct quotes (use a few verbatim in your diagnosis):
${params.voc.snippets.slice(0, 8).map((s, i) => `  [${i}] (${s.source} — ${s.sourceLabel}) "${s.quote}"`).join("\n")}
`
    : "";

  const competitorBlock = params.competitors
    .map(
      (c) =>
        `- ${c.name}: ${c.totalAdCount ?? "?"} ads (${c.videoAdCount ?? "?"} video, ${c.imageAdCount ?? "?"} image)`,
    )
    .join("\n");

  return `Diagnose the Meta-ads strategy for this company.

Company: ${params.companyName}
URL: ${params.companyUrl}
Product: ${params.productDescription || "(inferred)"}
ICP: ${params.icpDescription || "(inferred)"}
Notes: ${params.notes || "(none)"}
Ad content description: ${params.adContentDescription || "(none)"}

Website content (truncated):
${params.websiteContent.slice(0, 3000)}

Company Meta ads: ${params.companyAdCount ?? 0} total (${params.companyVideoCount ?? 0} video, ${params.companyImageCount ?? 0} image)
Competitors:
${competitorBlock}
${vocBlock}

${feedback ? `\nQA RETRY FEEDBACK (address all of these): ${feedback}\n` : ""}

Write the full 8-section diagnosis now.`;
}
