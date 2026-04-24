import Anthropic from "@anthropic-ai/sdk";
import type { QAResult } from "../types";

export const MODEL = "claude-sonnet-4-20250514";
export const client = new Anthropic();

export const HARD_BAN_PHRASES = [
  "it's not", // triggers "it's not X, it's Y" banned structure
  "delve",
  "leverage",
  "robust",
  "in the ever-changing landscape",
  "game-changer",
  "game changer",
  "supercharge",
  "unleash",
  "harness",
  "unlock your",
  "seamless",
  "seamlessly",
  "navigate the",
  "empower",
  "cutting-edge",
  "revolutionize",
];

/** Check for AI crutch phrases. Returns the banned phrases found. */
export function findBannedPhrases(text: string): string[] {
  const lower = text.toLowerCase();
  const hits: string[] = [];
  for (const phrase of HARD_BAN_PHRASES) {
    if (lower.includes(phrase)) hits.push(phrase);
  }
  // Check for "not X, it's Y" structure
  if (/\bnot\s+\w+[,.]?\s+it'?s\s+/i.test(text)) hits.push("it's not X, it's Y structure");
  return hits;
}

export interface QAContract<TOutput> {
  generatorName: string;
  qaName: string;
  maxRetries?: number;
  /** Called each attempt. First attempt gets no retry feedback. */
  generate: (feedback?: string) => Promise<TOutput>;
  /** Returns QA verdict. */
  qa: (output: TOutput) => Promise<QAResult>;
  /** Called on each attempt so the caller can surface agent activity. */
  onAttempt?: (attempt: number, outcome: "retry" | "pass" | "escalate", qa: QAResult) => Promise<void> | void;
}

export interface QAOutcome<T> {
  output: T;
  qa: QAResult;
  escalated: boolean;
}

/** Run a generator agent with a QA gate. 2 auto-retries. On 3rd fail, returns escalated. */
export async function runWithQA<T>(contract: QAContract<T>): Promise<QAOutcome<T>> {
  const maxRetries = contract.maxRetries ?? 2;
  let feedback: string | undefined;
  let lastOutput: T | null = null;
  let lastQa: QAResult | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const output = await contract.generate(feedback);
    const qa = await contract.qa(output);
    qa.retries = attempt;
    lastOutput = output;
    lastQa = qa;

    if (qa.pass) {
      await contract.onAttempt?.(attempt, "pass", qa);
      return { output, qa, escalated: false };
    }

    if (attempt < maxRetries) {
      await contract.onAttempt?.(attempt, "retry", qa);
      feedback = qa.feedbackForRetry;
    } else {
      await contract.onAttempt?.(attempt, "escalate", qa);
    }
  }

  return { output: lastOutput as T, qa: lastQa as QAResult, escalated: true };
}

/** Ask Claude to judge output against a rubric. Returns QA verdict. */
export async function judgeWithRubric(params: {
  systemPrompt: string;
  userPrompt: string;
  /** Rubric dimension names. Scores returned per dimension 1-10. */
  rubric: string[];
  /** Min score required on every dimension to pass. */
  passThreshold: number;
}): Promise<QAResult> {
  const schemaHint = params.rubric
    .map((r) => `  "${r}": <1-10>`)
    .join(",\n");

  const full = `${params.userPrompt}

You are a strict QA reviewer. Score the output on every rubric dimension from 1-10.
Return ONLY JSON in this exact shape, no prose, no code fences:

{
  "scores": {
${schemaHint}
  },
  "issues": ["<specific issue>", ...],
  "feedbackForRetry": "<actionable instruction for the generator to fix the issues>"
}

A pass requires EVERY dimension to score >= ${params.passThreshold}. Be strict. Favor a fail over a borderline pass.`;

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: params.systemPrompt,
    messages: [{ role: "user", content: full }],
  }, { timeout: 60_000 });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      pass: false,
      score: 0,
      issues: ["QA judge returned non-JSON output"],
      feedbackForRetry: "Judge parse failure — regenerate more carefully.",
      retries: 0,
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      scores: Record<string, number>;
      issues: string[];
      feedbackForRetry: string;
    };
    const scores = Object.values(parsed.scores);
    const mean = scores.reduce((a, b) => a + b, 0) / Math.max(scores.length, 1);
    const minScore = Math.min(...scores);
    const pass = minScore >= params.passThreshold;
    return {
      pass,
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
      issues: ["QA judge JSON parse error"],
      feedbackForRetry: "Regenerate with cleaner structure.",
      retries: 0,
    };
  }
}

/** Extract JSON object from a model response that may have prose around it. */
export function extractJson<T = unknown>(text: string): T | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : text;
  const match = body.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}
