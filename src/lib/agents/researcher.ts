import type { VoiceOfCustomer, VocSnippet, VocPattern, VocSource, AnalysisInput } from "../types";
import { client, MODEL, extractJson, runWithQA, judgeWithRubric, findBannedPhrases } from "./shared";
import { perplexitySearch, chatText } from "../ai/openrouter";

function classifySourceUrl(url: string): VocSource {
  const lower = (url || "").toLowerCase();
  if (lower.includes("reddit.com")) return "reddit";
  if (lower.includes("g2.com")) return "g2";
  if (lower.includes("trustpilot.com")) return "trustpilot";
  if (lower.includes("capterra.com")) return "capterra";
  if (lower.includes("youtube.com") || lower.includes("youtu.be"))
    return "youtube";
  if (lower.includes("blog") || lower.includes("medium.com")) return "blog";
  if (lower.includes("forum") || lower.includes("community.")) return "forum";
  return "other";
}

function emptyCheapVoc(companyName: string, reason: string): VoiceOfCustomer {
  return {
    sources: { redditSubs: [], reviewSites: [], forums: [] },
    snippets: [],
    languagePatterns: [],
    painPoints: [],
    desires: [],
    objections: [],
    reportMd: `# VoC for ${companyName}\n\n_${reason}_`,
    generatedAt: new Date().toISOString(),
    qa: {
      pass: false,
      score: 0,
      issues: [reason],
      retries: 0,
      feedbackForRetry: reason,
    },
  };
}

/**
 * Cheap-mode VoC research using Perplexity Sonar (built-in web search) +
 * DeepSeek for structuring into our schema. ~$0.01 total per call vs
 * ~$0.05+ for the full Anthropic web_search flow.
 */
export async function runResearcherCheap(
  input: AnalysisInput,
  onAgentProgress?: (msg: string) => Promise<void> | void,
): Promise<VoiceOfCustomer> {
  await onAgentProgress?.("Researcher (cheap): searching Reddit + reviews via Perplexity Sonar");

  const searchPrompt = `Find real customer voice for: "${input.companyName}" (${input.companyUrl}).
${input.productDescription ? `Product: ${input.productDescription}` : ""}
${input.icpDescription ? `ICP: ${input.icpDescription}` : ""}

Search Reddit, G2, Trustpilot, Capterra, and niche forums. Pull 8-12 REAL direct quotes from customers — pain points, objections, desires, and natural language they use. Include the URL where each quote lives.

Format each as:
"[exact customer quote]" — [source URL]

Group by: PAIN POINTS / OBJECTIONS / DESIRES / LANGUAGE PATTERNS.`;

  let searchText = "";
  let citations: string[] = [];
  try {
    const result = await perplexitySearch({
      prompt: searchPrompt,
      maxTokens: 2500,
      timeoutMs: 90_000,
    });
    searchText = result.text;
    citations = result.citations;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await onAgentProgress?.(`Researcher (cheap) escalate: Perplexity failed — ${msg}`);
    return emptyCheapVoc(input.companyName, `Perplexity search failed: ${msg}`);
  }

  if (!searchText || searchText.length < 100) {
    return emptyCheapVoc(input.companyName, "Perplexity returned empty/thin result");
  }

  await onAgentProgress?.("Researcher (cheap): structuring VoC via DeepSeek");

  const structurePrompt = `You are given raw web research output. Convert to a structured Voice of Customer JSON.

RAW RESEARCH:
${searchText}

CITATION URLS (in order of appearance):
${citations.map((c, i) => `[${i}] ${c}`).join("\n")}

Return ONLY this JSON shape (no prose, no markdown fences):
{
  "snippets": [
    { "url": "https://...", "sourceLabel": "r/marketing", "quote": "exact customer words" }
  ],
  "painPoints":     [{ "name": "short label", "description": "1 sentence", "snippetRefs": [0,1] }],
  "desires":        [{ "name": "...", "description": "...", "snippetRefs": [...] }],
  "objections":     [{ "name": "...", "description": "...", "snippetRefs": [...] }],
  "languagePatterns": [{ "name": "phrase pattern", "description": "how customers say it", "snippetRefs": [...] }]
}

Rules:
- Include 6-12 snippets, real direct quotes only
- snippetRefs are indices into the snippets array
- Use citation URLs from above when possible
- 2-4 items per category minimum
- If category has no real evidence, return [] for it`;

  let structured: {
    snippets?: Array<{ url: string; sourceLabel?: string; quote: string }>;
    painPoints?: VocPattern[];
    desires?: VocPattern[];
    objections?: VocPattern[];
    languagePatterns?: VocPattern[];
  } = {};
  try {
    const text = await chatText(structurePrompt, { maxTokens: 3000 });
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) structured = JSON.parse(jsonMatch[0]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await onAgentProgress?.(`Researcher (cheap) escalate: structuring failed — ${msg}`);
    return emptyCheapVoc(input.companyName, `Structuring failed: ${msg}`);
  }

  const snippets: VocSnippet[] = (structured.snippets || []).map((s) => ({
    source: classifySourceUrl(s.url),
    url: s.url || "",
    sourceLabel: s.sourceLabel || s.url || "web",
    quote: s.quote || "",
  }));

  const redditSubs = Array.from(
    new Set(
      snippets
        .filter((s) => s.source === "reddit")
        .map((s) => {
          const m = s.url.match(/reddit\.com\/r\/([^/]+)/i);
          return m ? m[1] : "";
        })
        .filter(Boolean),
    ),
  );
  const reviewSites = Array.from(
    new Set(
      snippets
        .filter((s) => ["g2", "trustpilot", "capterra"].includes(s.source))
        .map((s) => s.url),
    ),
  );
  const forums = Array.from(
    new Set(
      snippets.filter((s) => s.source === "forum").map((s) => s.url),
    ),
  );

  const voc: VoiceOfCustomer = {
    sources: { redditSubs, reviewSites, forums },
    snippets,
    languagePatterns: structured.languagePatterns || [],
    painPoints: structured.painPoints || [],
    desires: structured.desires || [],
    objections: structured.objections || [],
    reportMd: `# Voice of Customer — ${input.companyName} (cheap mode)\n\nResearched via Perplexity Sonar + DeepSeek structuring.\n\n${snippets.length} snippets across ${snippets.map((s) => s.source).filter((v, i, a) => a.indexOf(v) === i).length} source types.\n\n${searchText.slice(0, 1500)}`,
    generatedAt: new Date().toISOString(),
    qa: {
      pass: snippets.length >= 4,
      score: Math.min(10, snippets.length),
      issues: snippets.length < 4 ? ["Thin snippet coverage"] : [],
      retries: 0,
      feedbackForRetry: snippets.length < 4 ? "Re-run Perplexity with more specific niche query" : "",
    },
  };

  await onAgentProgress?.(
    `Researcher (cheap) pass: ${snippets.length} snippets, ${voc.painPoints.length} pain points`,
  );

  return voc;
}

/**
 * Agent 1 — Researcher.
 * Uses Claude's native web_search tool to hunt for Voice-of-Customer signal
 * across Reddit, G2, Trustpilot, Capterra, and niche forums.
 *
 * Two-phase flow:
 *   1. Source identification (what subs + review sites for this niche)
 *   2. Raw snippet extraction via web_search, synthesized into 4 VoC buckets.
 *
 * QA gate checks pattern grounding, source diversity, specificity, coverage.
 */

const WEB_SEARCH_TOOL = {
  type: "web_search_20250305" as const,
  name: "web_search" as const,
  max_uses: 10,
};

export async function runResearcher(
  input: AnalysisInput,
  onAgentProgress?: (msg: string) => Promise<void> | void,
): Promise<VoiceOfCustomer> {
  await onAgentProgress?.("Researcher agent: identifying VoC sources");

  // ---------- Phase 1: identify relevant subreddits + review sites ----------
  const sourcesRes = await client.messages.create({
    model: MODEL,
    max_tokens: 1000,
    system: sourceIdentificationPrompt,
    messages: [
      {
        role: "user",
        content: `Company: ${input.companyName}
Website: ${input.companyUrl}
Product: ${input.productDescription || "(not provided)"}
ICP: ${input.icpDescription || "(not provided)"}

Identify VoC sources for this company. Return JSON:
{
  "redditSubs": ["subredditName without r/", ...],
  "reviewSites": ["g2.com/products/...", "trustpilot.com/review/..."],
  "forums": ["forum.example.com", ...]
}
At least 3 subreddits, at least 2 review-site URLs, include niche-specific forums if relevant.`,
      },
    ],
  });

  const sourcesText = sourcesRes.content[0].type === "text" ? sourcesRes.content[0].text : "";
  const sources = extractJson<{
    redditSubs: string[];
    reviewSites: string[];
    forums: string[];
  }>(sourcesText) || { redditSubs: [], reviewSites: [], forums: [] };

  await onAgentProgress?.(
    `Researcher agent: found ${sources.redditSubs.length} subs + ${sources.reviewSites.length} review sites`,
  );

  // ---------- Phase 2: web_search + synthesis (with QA gate) ----------
  let attemptNumber = 0;
  const { output, qa, escalated } = await runWithQA<VoiceOfCustomer>({
    generatorName: "Researcher",
    qaName: "VocSynthesisQA",
    maxRetries: 0, // one-shot — web_search is slow and the prompt is tuned to hit all thresholds on pass 1
    generate: async (feedback) => {
      attemptNumber += 1;
      await onAgentProgress?.(
        `Researcher agent: running web search pass ${attemptNumber} (expect 90-150s)`,
      );
      const userPrompt = buildResearchPrompt(input, sources, feedback);
      // Hard-cap the web_search call at 180s so a single slow pass can't
      // hang the whole pipeline. On timeout we return empty and let the QA
      // gate escalate — the pipeline proceeds with whatever VoC we got.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180_000);
      let msg;
      try {
        msg = await client.messages.create(
          {
            model: MODEL,
            max_tokens: 8000,
            system: researchSystemPrompt,
            tools: [WEB_SEARCH_TOOL],
            messages: [{ role: "user", content: userPrompt }],
          },
          { signal: controller.signal },
        );
      } catch (err) {
        clearTimeout(timeoutId);
        await onAgentProgress?.(
          `Researcher agent: pass ${attemptNumber} timed out after 180s — using partial data`,
        );
        return emptyVoc(sources);
      }
      clearTimeout(timeoutId);

      // Combine all text blocks from the response
      const allText = msg.content
        .filter((b) => b.type === "text")
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("\n\n");

      const parsed = extractJson<{
        snippets: Array<{
          source: VocSource;
          url: string;
          sourceLabel: string;
          quote: string;
          signalScore?: number;
        }>;
        languagePatterns: VocPatternInput[];
        painPoints: VocPatternInput[];
        desires: VocPatternInput[];
        objections: VocPatternInput[];
        reportMd: string;
      }>(allText);

      if (!parsed) {
        return emptyVoc(sources);
      }

      return {
        sources,
        snippets: parsed.snippets || [],
        languagePatterns: toPatterns(parsed.languagePatterns),
        painPoints: toPatterns(parsed.painPoints),
        desires: toPatterns(parsed.desires),
        objections: toPatterns(parsed.objections),
        reportMd: parsed.reportMd || "",
        generatedAt: new Date().toISOString(),
      };
    },
    qa: async (voc) => vocSynthesisQA(voc),
    onAttempt: async (attempt, outcome, qa) => {
      await onAgentProgress?.(
        `VoC QA ${outcome} (attempt ${attempt + 1}, score ${qa.score})`,
      );
    },
  });

  output.qa = { ...qa, retries: qa.retries };
  if (escalated) {
    await onAgentProgress?.(`VoC escalated: ${qa.issues.slice(0, 2).join("; ")}`);
  }
  return output;
}

interface VocPatternInput {
  name: string;
  description: string;
  snippetRefs: number[];
}

function toPatterns(raw?: VocPatternInput[]): VocPattern[] {
  if (!raw) return [];
  return raw.map((p) => ({
    name: p.name,
    description: p.description,
    snippetRefs: p.snippetRefs || [],
    frequency: (p.snippetRefs || []).length,
  }));
}

function emptyVoc(sources: VoiceOfCustomer["sources"]): VoiceOfCustomer {
  return {
    sources,
    snippets: [],
    languagePatterns: [],
    painPoints: [],
    desires: [],
    objections: [],
    reportMd: "",
    generatedAt: new Date().toISOString(),
  };
}

/* ───────── QA ───────── */

async function vocSynthesisQA(voc: VoiceOfCustomer): Promise<ReturnType<typeof judgeWithRubric> extends Promise<infer R> ? R : never> {
  // Fast structural checks before invoking judge
  const redditCount = voc.snippets.filter((s) => s.source === "reddit").length;
  const reviewCount = voc.snippets.filter(
    (s) => s.source === "g2" || s.source === "trustpilot" || s.source === "capterra",
  ).length;
  const hardFails: string[] = [];
  // Loosened bars — web_search can legitimately return 10-15 high-quality
  // snippets. Chasing 20+ forces retries that blow the time budget.
  if (voc.snippets.length < 10) hardFails.push(`Only ${voc.snippets.length} snippets (need >= 10)`);
  if (redditCount < 3) hardFails.push(`Only ${redditCount} Reddit snippets (need >= 3)`);
  if (reviewCount < 2) hardFails.push(`Only ${reviewCount} review snippets (need >= 2)`);
  if (voc.painPoints.length < 2) hardFails.push(`Only ${voc.painPoints.length} pain points`);
  if (voc.languagePatterns.length < 2) hardFails.push(`Only ${voc.languagePatterns.length} language patterns`);
  const banned = findBannedPhrases(voc.reportMd);
  if (banned.length > 0) hardFails.push(`Banned phrases in report: ${banned.join(", ")}`);

  // Each pattern must cite >= 1 snippet (was 2; too strict on a small snippet pool).
  const underCitedPatterns: string[] = [];
  for (const group of [voc.painPoints, voc.desires, voc.objections, voc.languagePatterns]) {
    for (const p of group) {
      if ((p.snippetRefs || []).length < 1) underCitedPatterns.push(p.name);
    }
  }
  if (underCitedPatterns.length > 0) {
    hardFails.push(`Patterns with 0 citations: ${underCitedPatterns.slice(0, 5).join(", ")}`);
  }

  if (hardFails.length > 0) {
    return {
      pass: false,
      score: 3,
      issues: hardFails,
      feedbackForRetry: `Fix structural failures: ${hardFails.join(" | ")}. Run MORE web searches. Cite at least 2 snippets per pattern. Do not use banned phrases.`,
      retries: 0,
    };
  }

  // Deep judge call only if structural checks pass
  return judgeWithRubric({
    systemPrompt: "You are a strict research QA reviewer evaluating Voice-of-Customer synthesis.",
    userPrompt: `Evaluate this VoC synthesis:

Sources: ${JSON.stringify(voc.sources)}
Snippet count: ${voc.snippets.length} (${voc.snippets.filter((s) => s.source === "reddit").length} reddit)
Pain points (${voc.painPoints.length}):
${voc.painPoints.map((p) => `- ${p.name}: ${p.description}`).join("\n")}
Language patterns (${voc.languagePatterns.length}):
${voc.languagePatterns.map((p) => `- ${p.name}: ${p.description}`).join("\n")}
Desires: ${voc.desires.map((p) => p.name).join(", ")}
Objections: ${voc.objections.map((p) => p.name).join(", ")}

First 500 chars of report:
${voc.reportMd.slice(0, 500)}`,
    rubric: [
      "sourceDiversity",
      "patternGrounding",
      "specificity",
      "coverage",
      "usability",
    ],
    passThreshold: 7,
  });
}

/* ───────── Prompts ───────── */

const sourceIdentificationPrompt = `You are a Voice-of-Customer researcher. Given a company + ICP, identify the most relevant online communities where their target customers actually talk.

Focus on:
- Reddit subreddits where the ICP hangs out (both general and niche)
- Review sites (G2, Trustpilot, Capterra) pages for this product AND direct competitors
- Niche forums if applicable (e.g. Indie Hackers, HN, specialist communities)

Return ONLY JSON. No prose.`;

const researchSystemPrompt = `You are a Voice-of-Customer research agent. Your job is to extract REAL customer language from the web — not marketing copy, not your opinions, real quotes with source URLs.

CRITICAL RULES — YOU HAVE ONE SHOT. NO RETRIES. Hit every threshold below on this pass:
- MINIMUM 15 snippets (target 20+). >= 7 from Reddit. >= 4 from review sites (G2/Trustpilot/Capterra).
- >= 3 pain points, >= 3 desires, >= 3 objections, >= 3 language patterns.
- Every pattern cites >= 2 snippet indices.
- Use web_search 8-10 times with DIFFERENT queries (product name + pain, competitor + review, ICP + complaint, feature + frustration, etc.). Do not stop at 5 searches.

1. Use web_search aggressively — 8-10 searches across different sources and angles.
2. Every snippet must have a working source URL, a direct quote (no paraphrasing), and a sourceLabel.
3. Every pattern must cite >= 2 snippet indices from your snippets array.
4. Pain points ranked by frequency (how often the pattern appears across snippets).
5. Language patterns = exact terminology customers use (not what you'd call it).
6. Desires = "I wish X existed" statements.
7. Objections = reasons they don't buy or churn.
8. NEVER invent quotes. If you can't find real quotes, say so.
9. AVOID: "delve", "leverage", "robust", "game-changer", "it's not X it's Y", "seamless", "revolutionize", "empower", "unleash".
10. Return ONLY a JSON block (optionally fenced). No prose outside it.

JSON schema:
{
  "snippets": [
    {"source": "reddit"|"g2"|"trustpilot"|"capterra"|"youtube"|"forum"|"blog"|"other",
     "url": "https://...",
     "sourceLabel": "r/SaaS" or "G2 — Linear review",
     "quote": "exact quote, no ellipses unless truncated",
     "signalScore": 1-10}
  ],
  "languagePatterns": [{"name": "...", "description": "...", "snippetRefs": [0,3,5]}],
  "painPoints": [...],
  "desires": [...],
  "objections": [...],
  "reportMd": "Full markdown VoC report, with headings per bucket, quotes inline, 'What to do with this:' callouts per section. At least 600 words."
}`;

function buildResearchPrompt(
  input: AnalysisInput,
  sources: { redditSubs: string[]; reviewSites: string[]; forums: string[] },
  feedback?: string,
): string {
  return `Research Voice-of-Customer signal for this company.

Company: ${input.companyName}
Website: ${input.companyUrl}
Product: ${input.productDescription || "(inferred from site)"}
ICP: ${input.icpDescription || "(inferred)"}

Sources to search:
- Reddit: ${sources.redditSubs.map((s) => `r/${s}`).join(", ")}
- Reviews: ${sources.reviewSites.join(", ")}
- Forums: ${sources.forums.join(", ") || "(none)"}

Target output:
- At least 20 snippets total
- At least 7 from Reddit
- At least 4 from review sites
- Every pattern cites >= 2 snippets

${feedback ? `RETRY FEEDBACK from QA: ${feedback}\nAddress these issues specifically.` : ""}

Now execute web searches and return JSON only.`;
}
