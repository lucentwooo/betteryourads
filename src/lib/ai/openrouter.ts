/**
 * OpenRouter helpers for cheap test mode.
 *
 * - chatText: DeepSeek v3.1 for general text (categorize, suggest competitors,
 *   brand do/don't, diagnosis, etc.)
 * - chatVision: Gemini 2.5 Flash for image-based brand color extraction
 * - perplexitySearch: Perplexity Sonar for Voice of Customer web research
 *
 * All three use the same OPENROUTER_API_KEY env var.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const TEXT_MODEL =
  process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat-v3.1";
const VISION_MODEL =
  process.env.OPENROUTER_VISION_MODEL || "google/gemini-2.5-flash";
const SEARCH_MODEL =
  process.env.OPENROUTER_SEARCH_MODEL || "perplexity/sonar";

function ensureKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error(
      "OPENROUTER_API_KEY is missing. Add it in Vercel to use cheap test mode.",
    );
  }
  return key;
}

function commonHeaders() {
  return {
    Authorization: `Bearer ${ensureKey()}`,
    "Content-Type": "application/json",
    "HTTP-Referer":
      process.env.NEXT_PUBLIC_APP_URL || "https://betteryourads.com",
    "X-Title": "Better Your Ads",
  };
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
}

interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  model?: string;
}

async function chatRequest(
  model: string,
  messages: ChatMessage[],
  opts: ChatOptions = {},
): Promise<{ text: string; raw: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? 220_000,
  );
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: commonHeaders(),
      body: JSON.stringify({
        model,
        messages,
        max_tokens: opts.maxTokens ?? 1500,
        temperature: opts.temperature ?? 0.4,
        // DeepInfra's instance of deepseek/deepseek-chat-v3.1 truncates to
        // ~150 completion tokens with finish_reason=stop. Pin to providers
        // that produce full-length output. Doesn't apply to vision/search
        // models (Gemini, Sonar) which only have one provider, but harmless.
        provider: {
          order: ["Novita", "SambaNova", "Fireworks", "Together"],
          ignore: ["DeepInfra"],
          allow_fallbacks: true,
        },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `OpenRouter ${model} failed: HTTP ${res.status} — ${body.slice(0, 400)}`,
      );
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      citations?: string[];
    };
    const text = json.choices?.[0]?.message?.content || "";
    return { text, raw: json };
  } finally {
    clearTimeout(timeout);
  }
}

export async function chatText(
  prompt: string,
  opts: ChatOptions & { system?: string } = {},
): Promise<string> {
  const messages: ChatMessage[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: prompt });
  const { text } = await chatRequest(opts.model || TEXT_MODEL, messages, opts);
  return text;
}

/**
 * Vision call using Gemini 2.5 Flash via OpenRouter.
 * Accepts a base64-encoded image and a text prompt; returns the model's text.
 */
export async function chatVision(params: {
  base64: string;
  mediaType: string;
  prompt: string;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<string> {
  const dataUrl = `data:${params.mediaType};base64,${params.base64}`;
  const messages: ChatMessage[] = [
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: dataUrl } },
        { type: "text", text: params.prompt },
      ],
    },
  ];
  const { text } = await chatRequest(VISION_MODEL, messages, {
    maxTokens: params.maxTokens ?? 500,
    timeoutMs: params.timeoutMs,
    temperature: 0.2,
  });
  return text;
}

/**
 * Perplexity Sonar call via OpenRouter — used for Voice of Customer research.
 * Sonar has built-in web search across Reddit, review sites, and forums.
 */
export async function perplexitySearch(params: {
  prompt: string;
  system?: string;
  maxTokens?: number;
  timeoutMs?: number;
  /** "pro" → perplexity/sonar-pro (better recall, ~3x cost). Default = sonar. */
  tier?: "sonar" | "pro";
}): Promise<{ text: string; citations: string[] }> {
  const messages: ChatMessage[] = [];
  if (params.system) messages.push({ role: "system", content: params.system });
  messages.push({ role: "user", content: params.prompt });
  const model = params.tier === "pro" ? "perplexity/sonar-pro" : SEARCH_MODEL;
  const { text, raw } = await chatRequest(model, messages, {
    maxTokens: params.maxTokens ?? 2000,
    timeoutMs: params.timeoutMs ?? 90_000,
    temperature: 0.3,
  });
  const citations =
    (raw as { citations?: string[] })?.citations || [];
  return { text, citations };
}
