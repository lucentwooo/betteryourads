import type { Concept, DiagnosisResult, VoiceOfCustomer, AwarenessStage } from "../types";
import { client, MODEL, runWithQA, judgeWithRubric, extractJson, findBannedPhrases } from "./shared";

/**
 * Agent 3 — Creative Director (Concept Architect).
 *
 * Turns the diagnosis + VoC into 6-8 ranked concepts.
 * Every concept must tie to a specific diagnosis finding AND a VoC pattern.
 * QA enforces awareness-stage distribution, no duplicates, testable hypotheses.
 */

const STAGES: AwarenessStage[] = ["unaware", "problem", "solution", "product", "most"];

export async function runCreativeDirector(
  params: {
    diagnosis: DiagnosisResult;
    voc?: VoiceOfCustomer;
    companyName: string;
    icpDescription?: string;
  },
  onAgentProgress?: (msg: string) => Promise<void> | void,
): Promise<Concept[]> {
  await onAgentProgress?.("Creative Director agent: architecting concepts");

  const { output, qa, escalated } = await runWithQA<Concept[]>({
    generatorName: "CreativeDirector",
    qaName: "ConceptQA",
    generate: async (feedback) => {
      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 6000,
        system: conceptSystemPrompt,
        messages: [
          { role: "user", content: buildConceptUserPrompt(params, feedback) },
        ],
      });
      const text = msg.content[0].type === "text" ? msg.content[0].text : "";
      const parsed = extractJson<{ concepts: ConceptInput[] }>(text);
      if (!parsed?.concepts) return [];
      return parsed.concepts.map((c, i) => ({
        id: `c${i + 1}`,
        name: c.name,
        awarenessStage: c.awarenessStage,
        angle: c.angle,
        framework: c.framework,
        rationale: c.rationale,
        diagnosisFindingRef: c.diagnosisFindingRef,
        vocPatternRefs: c.vocPatternRefs || [],
        priority: c.priority ?? i + 1,
        approved: "pending" as const,
      }));
    },
    qa: async (concepts) => conceptQA(concepts, params.voc),
    onAttempt: async (attempt, outcome, q) => {
      await onAgentProgress?.(
        `Concept QA ${outcome} (attempt ${attempt + 1}, score ${q.score})`,
      );
    },
  });

  if (escalated) {
    await onAgentProgress?.(`Concepts escalated: ${qa.issues.slice(0, 2).join("; ")}`);
  }
  return output;
}

interface ConceptInput {
  name: string;
  awarenessStage: AwarenessStage;
  angle: string;
  framework: string;
  rationale: string;
  diagnosisFindingRef: string;
  vocPatternRefs: string[];
  priority?: number;
}

/* ───────── QA ───────── */

async function conceptQA(concepts: Concept[], voc?: VoiceOfCustomer) {
  const hardFails: string[] = [];

  if (concepts.length < 6) hardFails.push(`Only ${concepts.length} concepts (need >= 6)`);

  // Distinct awareness stages — at least 3 stages represented
  const stagesUsed = new Set(concepts.map((c) => c.awarenessStage));
  if (stagesUsed.size < 3) {
    hardFails.push(`Only ${stagesUsed.size} awareness stages (need >= 3 distinct)`);
  }
  for (const s of stagesUsed) {
    if (!STAGES.includes(s)) hardFails.push(`Invalid stage "${s}"`);
  }

  // No duplicate angles
  const angles = new Set<string>();
  for (const c of concepts) {
    const key = c.angle.toLowerCase().replace(/\s+/g, " ").slice(0, 50);
    if (angles.has(key)) hardFails.push(`Duplicate angle: "${c.angle.slice(0, 50)}"`);
    angles.add(key);
  }

  // Every concept must cite a diagnosis finding + VoC pattern
  const vocPatternNames = new Set<string>();
  if (voc) {
    for (const p of [...voc.painPoints, ...voc.desires, ...voc.objections, ...voc.languagePatterns]) {
      vocPatternNames.add(p.name);
    }
  }

  // Only require VoC pattern refs when VoC actually produced patterns to
  // reference. Otherwise concepts would be unfixable.
  const vocRequired = voc && vocPatternNames.size >= 3;
  for (const c of concepts) {
    if (!c.diagnosisFindingRef || c.diagnosisFindingRef.length < 10) {
      hardFails.push(`Concept "${c.name}" missing diagnosisFindingRef`);
    }
    if (vocRequired && (c.vocPatternRefs?.length ?? 0) === 0) {
      hardFails.push(`Concept "${c.name}" missing vocPatternRefs`);
    }
    if (vocRequired) {
      for (const ref of c.vocPatternRefs || []) {
        if (!vocPatternNames.has(ref)) {
          hardFails.push(`Concept "${c.name}" references unknown VoC pattern "${ref}"`);
        }
      }
    }
    if (!c.rationale || c.rationale.length < 30) {
      hardFails.push(`Concept "${c.name}" rationale too thin`);
    }
  }

  // Banned phrases in rationale/angle
  const allText = concepts.map((c) => `${c.angle} ${c.rationale}`).join(" ");
  const banned = findBannedPhrases(allText);
  if (banned.length > 0) hardFails.push(`Banned phrases: ${banned.join(", ")}`);

  if (hardFails.length > 0) {
    return {
      pass: false,
      score: 3,
      issues: hardFails,
      feedbackForRetry: `Fix: ${hardFails.slice(0, 6).join(" | ")}. Use only these VoC pattern names verbatim: ${[...vocPatternNames].slice(0, 10).join(", ")}. Distribute across >= 3 awareness stages. No duplicate angles.`,
      retries: 0,
    };
  }

  return judgeWithRubric({
    systemPrompt:
      "You are a strict creative strategist evaluating whether concept briefs are specific, testable, and grounded in evidence.",
    userPrompt: `Evaluate these concepts:

${concepts
  .map(
    (c) =>
      `[${c.priority}] ${c.name} — stage: ${c.awarenessStage}, framework: ${c.framework}
   angle: ${c.angle}
   rationale: ${c.rationale.slice(0, 200)}
   voc: ${c.vocPatternRefs.join(", ")}`,
  )
  .join("\n\n")}`,
    rubric: ["specificity", "evidenceGrounding", "testability", "stageDistribution", "distinctness"],
    passThreshold: 7,
  });
}

/* ───────── Prompts ───────── */

const conceptSystemPrompt = `You are an elite creative strategist. Convert diagnosis findings + VoC into testable concept briefs.

HARD RULES:
- Return 6-8 concepts, each tied to a SPECIFIC diagnosis finding AND at least one VoC pattern (use the exact pattern names provided).
- Distribute across at least 3 awareness stages (unaware / problem / solution / product / most), weighted to the gaps the diagnosis calls out.
- Every "angle" is a one-sentence testable creative hook, NOT a description of a format.
- "framework" = a proven structure (e.g. Problem-Agitate-Solve, Us-vs-Them, Before-After-Bridge, Customer POV, Founder Confession, Feature Tour, Testimonial Stack).
- "rationale" explains why THIS concept, now, for THIS audience — citing the diagnosis finding and VoC pattern.
- Priority is 1..N where 1 = highest ROI test-first.
- NEVER use: delve, leverage, robust, seamless, game-changer, unleash, harness, empower, revolutionize, "it's not X, it's Y".

OUTPUT: Return ONLY a JSON object (optionally fenced), no prose:
{
  "concepts": [
    {
      "name": "The Spreadsheet Confession",
      "awarenessStage": "problem",
      "angle": "Founder POV showing their cluttered pre-Linear Notion doc, then the Linear board",
      "framework": "Before-After-Bridge",
      "rationale": "Diagnosis flags zero problem-aware creative. VoC pattern 'Tool chaos before switching' shows exactly this pain point.",
      "diagnosisFindingRef": "Missing Opportunities section — no problem-aware angle",
      "vocPatternRefs": ["Tool chaos before switching"],
      "priority": 1
    }
  ]
}`;

function buildConceptUserPrompt(
  params: Parameters<typeof runCreativeDirector>[0],
  feedback?: string,
): string {
  const vocBlock = params.voc
    ? `
VoC pattern names you may reference (use EXACT names):
Pain: ${params.voc.painPoints.map((p) => `"${p.name}"`).join(", ")}
Desires: ${params.voc.desires.map((p) => `"${p.name}"`).join(", ")}
Objections: ${params.voc.objections.map((p) => `"${p.name}"`).join(", ")}
Language: ${params.voc.languagePatterns.map((p) => `"${p.name}"`).join(", ")}
`
    : "";

  return `Architect 6-8 concepts for ${params.companyName}.
ICP: ${params.icpDescription || "(inferred)"}

DIAGNOSIS (ground every concept in a specific finding):

Not working:
${params.diagnosis.notWorking.slice(0, 800)}

Competitor wins:
${params.diagnosis.competitorWins.slice(0, 800)}

Missing opportunities:
${params.diagnosis.missingOpportunities.slice(0, 800)}

Awareness stage analysis:
${params.diagnosis.awarenessStageAnalysis.slice(0, 800)}

Recommended concepts (seed ideas — expand, reorder, improve):
${params.diagnosis.recommendedConcepts.slice(0, 1200)}
${vocBlock}

${feedback ? `\nQA RETRY FEEDBACK: ${feedback}\n` : ""}

Return the JSON now.`;
}
