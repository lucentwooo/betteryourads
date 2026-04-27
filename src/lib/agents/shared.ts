import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageCreateParamsNonStreaming,
  MessageParam,
} from "@anthropic-ai/sdk/resources/messages";
import type { QAResult } from "../types";

// Lean & Mean tier: cheap models on the default path, Sonnet only on the
// final humanizer pass. Routing is by model-name prefix (see
// createTextMessage): claude-* → Anthropic SDK; everything else →
// OpenRouter using the same slug.
//
// MODEL_CREATIVE: ad copy + concepts. Kimi K2 has the best human voice
// among cheap models.
export const MODEL_CREATIVE =
  process.env.MODEL_CREATIVE || "moonshotai/kimi-k2-0905";
// MODEL_REASON: diagnosis synthesis + structured visual briefs. DeepSeek
// V3.x is the best $/intelligence ratio for reasoning-heavy work.
export const MODEL_REASON =
  process.env.MODEL_REASON || "deepseek/deepseek-chat-v3.1";
// MODEL_FAST: orchestration, structured extraction, QA rubrics. Gemini
// Flash is dirt cheap and reliable on JSON.
export const MODEL_FAST =
  process.env.MODEL_FAST || "google/gemini-2.5-flash";
// MODEL_HUMANIZE: Sonnet 4.6, called once at the end to polish ad copy +
// diagnosis prose into a sharp human voice.
export const MODEL_HUMANIZE =
  process.env.MODEL_HUMANIZE || "claude-sonnet-4-6";
// Vision QA on generated images stays on Claude Haiku — Anthropic's
// image content shape is what image-generator.ts already passes.
export const MODEL_VISION_QA = "claude-haiku-4-5-20251001";

// Back-compat aliases. Old code paths import MODEL/MODEL_CHEAP — these
// now point at the cheap tier so any forgotten import still gets cheap.
export const MODEL = MODEL_CREATIVE;
export const MODEL_CHEAP = MODEL_FAST;

// Legacy single-model OpenRouter slug used by the cheap-mode flag. Kept
// for backwards compat with the ?cheap=1 toggle which routes everything
// through this one model.
export const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat-v3.1";

export const client = new Anthropic();
export type ModelMode = "full" | "cheap";

type TextMessage = {
  content: [{ type: "text"; text: string }];
};

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

function flattenMessageContent(content: MessageParam["content"]): string {
  if (typeof content === "string") return content;
  return content
    .map((block) => {
      if (block.type === "text") return block.text;
      return `[${block.type} content omitted in cheap model mode]`;
    })
    .join("\n");
}

function flattenSystem(system: MessageCreateParamsNonStreaming["system"]): string | undefined {
  if (!system) return undefined;
  if (typeof system === "string") return system;
  return system
    .map((block) => (block.type === "text" ? block.text : ""))
    .filter(Boolean)
    .join("\n");
}

export async function createTextMessage(
  params: MessageCreateParamsNonStreaming,
  options?: { timeout?: number },
  mode: ModelMode = "full",
): Promise<TextMessage> {
  // Router: Anthropic SDK for claude-* models, OpenRouter for everything
  // else (Kimi, DeepSeek, Gemini, etc.). The legacy `mode === "cheap"`
  // flag still routes through OpenRouter with OPENROUTER_MODEL, ignoring
  // params.model. Anything else uses params.model verbatim as the
  // OpenRouter slug.
  const modelStr = String(params.model);
  const isClaude = modelStr.startsWith("claude-");

  if (mode !== "cheap" && isClaude) {
    return client.messages.create(params, options) as unknown as Promise<TextMessage>;
  }

  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error(
      "OPENROUTER_API_KEY is missing. Add it in Vercel to use non-Anthropic models.",
    );
  }

  // In cheap mode the user explicitly asked for the legacy single-model
  // path. Otherwise use whatever model the caller specified.
  const openrouterSlug = mode === "cheap" ? OPENROUTER_MODEL : modelStr;

  const controller = new AbortController();
  // OpenRouter is generally slower than Claude on long prompts. Use 220s
  // default so callers don't have to remember.
  const defaultTimeoutMs = 220_000;
  const timeout = setTimeout(() => controller.abort(), options?.timeout ?? defaultTimeoutMs);
  try {
    const system = flattenSystem(params.system);
    const messages = [
      ...(system ? [{ role: "system", content: system }] : []),
      ...params.messages.map((message) => ({
        role: message.role,
        content: flattenMessageContent(message.content),
      })),
    ];

    // DeepSeek V3.1 specifically suffers from one upstream provider
    // (DeepInfra) truncating completions at ~150 tokens. Pin provider
    // order only for that model so unrelated models aren't constrained.
    const isDeepSeek = openrouterSlug.startsWith("deepseek/");
    const providerConfig = isDeepSeek
      ? {
          order: ["Novita", "SambaNova", "Fireworks", "Together"],
          ignore: ["DeepInfra"],
          allow_fallbacks: true,
        }
      : undefined;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://betteryourads.com",
        "X-Title": "Better Your Ads",
      },
      body: JSON.stringify({
        model: openrouterSlug,
        messages,
        max_tokens: params.max_tokens,
        temperature: params.temperature,
        ...(providerConfig ? { provider: providerConfig } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 300)}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = data.choices?.[0]?.message?.content || "";
    const finish = data.choices?.[0]?.finish_reason || "?";
    console.log(
      `[openrouter] ${OPENROUTER_MODEL} finish=${finish} prompt=${data.usage?.prompt_tokens ?? "?"} completion=${data.usage?.completion_tokens ?? "?"} bytes=${text.length} preview=${JSON.stringify(text.slice(0, 300))}`,
    );
    return { content: [{ type: "text", text }] };
  } finally {
    clearTimeout(timeout);
  }
}

/** Ask Claude to judge output against a rubric. Returns QA verdict. */
export async function judgeWithRubric(params: {
  systemPrompt: string;
  userPrompt: string;
  /** Rubric dimension names. Scores returned per dimension 1-10. */
  rubric: string[];
  /** Min score required on every dimension to pass. */
  passThreshold: number;
  modelMode?: ModelMode;
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

  const msg = await createTextMessage({
    model: MODEL_CHEAP,
    max_tokens: 2000,
    system: params.systemPrompt,
    messages: [{ role: "user", content: full }],
  }, { timeout: params.modelMode === "cheap" ? 180_000 : 60_000 }, params.modelMode);

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  // Strip code fences first — DeepSeek often wraps JSON in ```json ... ```
  const fenceStripped = text.replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1");
  // Greedy match captures the full JSON even when models add prose around it.
  const jsonMatch = fenceStripped.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // Cheap-mode tolerant fallback: if the judge can't return JSON, treat it
    // as a soft pass at threshold so the pipeline keeps moving instead of
    // bouncing forever. The diagnosis itself is what users see; a flaky judge
    // shouldn't block the whole result.
    if (params.modelMode === "cheap") {
      return {
        pass: true,
        score: params.passThreshold,
        issues: ["QA judge returned non-JSON; soft-passing in cheap mode"],
        feedbackForRetry: "",
        retries: 0,
      };
    }
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
    if (params.modelMode === "cheap") {
      return {
        pass: true,
        score: params.passThreshold,
        issues: ["QA judge JSON parse error; soft-passing in cheap mode"],
        feedbackForRetry: "",
        retries: 0,
      };
    }
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
