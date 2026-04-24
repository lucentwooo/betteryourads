"use client";

import { useState } from "react";
import { MessageSquare, Quote } from "lucide-react";
import type { VoiceOfCustomer, VocPattern, VocSnippet } from "@/lib/types";

type Bucket = "pain" | "desires" | "objections" | "language";

const BUCKET_META: Record<Bucket, { label: string; tone: string; copy: string }> = {
  pain:       { label: "Pain points",       tone: "bg-coral/90 text-white",  copy: "What's hurting right now" },
  desires:    { label: "Desires",           tone: "bg-sage text-white",       copy: "What they wish existed" },
  objections: { label: "Objections",        tone: "bg-ink text-paper",        copy: "Why they don't buy" },
  language:   { label: "Language patterns", tone: "bg-butter text-ink",       copy: "Exact terminology they use" },
};

export function VocSection({ voc }: { voc: VoiceOfCustomer }) {
  const [active, setActive] = useState<Bucket>("pain");

  const patterns: Record<Bucket, VocPattern[]> = {
    pain: voc.painPoints,
    desires: voc.desires,
    objections: voc.objections,
    language: voc.languagePatterns,
  };

  const sourcesCount =
    voc.sources.redditSubs.length + voc.sources.reviewSites.length + voc.sources.forums.length;

  const sampleQuotes = voc.snippets.slice(0, 6);

  return (
    <div className="space-y-12">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-3xl">
          <div className="eyebrow text-coral">Voice of Customer</div>
          <h3 className="display mt-4 text-[clamp(2rem,4vw,3.25rem)]">
            What real people are{" "}
            <span className="display-italic text-coral">actually saying</span>.
          </h3>
          <p className="mt-4 text-lg text-ink/70">
            Pulled from {sourcesCount} sources — Reddit, G2, Trustpilot, niche forums. Every
            pattern cites at least one real quote. The Strategist uses these to ground the
            diagnosis; the Copywriter lifts phrases verbatim.
          </p>
        </div>
        <StatCard label="Snippets" value={voc.snippets.length} />
      </header>

      {/* Bucket tabs */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(BUCKET_META) as Bucket[]).map((b) => {
          const meta = BUCKET_META[b];
          const count = patterns[b].length;
          const isActive = active === b;
          return (
            <button
              key={b}
              type="button"
              onClick={() => setActive(b)}
              className={`inline-flex items-center gap-2 rounded-xl border-[1.5px] px-4 py-2.5 font-mono text-[0.72rem] font-semibold uppercase tracking-[0.14em] transition ${
                isActive
                  ? `border-ink ${meta.tone} shadow-[3px_4px_0_0_var(--ink)]`
                  : "border-ink/15 bg-card text-ink/70 hover:border-ink hover:bg-paper hover:text-ink"
              }`}
            >
              {meta.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[0.65rem] ${isActive ? "bg-paper/25" : "bg-ink/10"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active bucket content */}
      <div>
        <p className="eyebrow text-ink/60">{BUCKET_META[active].copy}</p>
        <ol className="mt-5 divide-y divide-hairline border-y hairline">
          {patterns[active].map((p, i) => (
            <li key={p.name + i} className="grid grid-cols-[3rem_1fr] gap-6 py-6 md:grid-cols-[4rem_1fr]">
              <span className="font-semibold text-3xl leading-none text-coral md:text-4xl">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h4 className="font-semibold text-xl text-ink md:text-2xl">{p.name}</h4>
                {p.description && (
                  <p className="mt-2 text-[0.98rem] leading-relaxed text-ink/80">{p.description}</p>
                )}
                <PatternEvidence pattern={p} snippets={voc.snippets} />
              </div>
            </li>
          ))}
          {patterns[active].length === 0 && (
            <li className="py-6 text-ink/50">No patterns in this bucket.</li>
          )}
        </ol>
      </div>

      {/* Sample raw quotes strip */}
      {sampleQuotes.length > 0 && (
        <section className="rounded-[1.4rem] border-[1.5px] border-ink bg-card p-6 shadow-[4px_5px_0_0_var(--ink)] md:p-8">
          <div className="eyebrow text-coral inline-flex items-center gap-2">
            <Quote className="h-3.5 w-3.5" /> Receipts
          </div>
          <p className="mt-2 text-ink/65">Straight from the source — copy these verbatim.</p>
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            {sampleQuotes.map((s, i) => (
              <QuoteCard key={i} snippet={s} />
            ))}
          </div>
        </section>
      )}

      {/* Sources footer */}
      <div className="rounded-2xl border hairline bg-paper/60 p-5">
        <div className="eyebrow text-ink/60">Sources scanned</div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {voc.sources.redditSubs.map((s) => (
            <span key={s} className="rounded-full bg-ink px-2.5 py-0.5 font-mono text-[0.65rem] text-paper">
              r/{s}
            </span>
          ))}
          {voc.sources.reviewSites.map((s) => (
            <span key={s} className="rounded-full bg-butter px-2.5 py-0.5 font-mono text-[0.65rem] text-ink">
              {shortenUrl(s)}
            </span>
          ))}
          {voc.sources.forums.map((s) => (
            <span key={s} className="rounded-full bg-blush px-2.5 py-0.5 font-mono text-[0.65rem] text-ink">
              {shortenUrl(s)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function PatternEvidence({ pattern, snippets }: { pattern: VocPattern; snippets: VocSnippet[] }) {
  const cited = pattern.snippetRefs
    .map((idx) => snippets[idx])
    .filter((s): s is VocSnippet => !!s)
    .slice(0, 2);

  if (cited.length === 0) return null;

  return (
    <div className="mt-4 space-y-3">
      {cited.map((s, i) => (
        <blockquote
          key={i}
          className="font-semibold border-l-2 border-coral pl-4 text-[1.05rem] leading-relaxed text-ink/75"
        >
          &ldquo;{s.quote}&rdquo;
          {s.url && (
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 font-mono text-[0.7rem] not-italic text-coral hover:underline"
            >
              {s.sourceLabel || s.source} ↗
            </a>
          )}
        </blockquote>
      ))}
    </div>
  );
}

function QuoteCard({ snippet }: { snippet: VocSnippet }) {
  return (
    <div className="rounded-2xl border hairline bg-paper p-5">
      <div className="flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-ink/50">
        <MessageSquare className="h-3.5 w-3.5" />
        {snippet.sourceLabel || snippet.source}
      </div>
      <p className="font-semibold mt-3 text-[1.05rem] leading-relaxed text-ink">
        &ldquo;{snippet.quote}&rdquo;
      </p>
      {snippet.url && (
        <a
          href={snippet.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block font-mono text-[0.7rem] text-coral hover:underline"
        >
          {snippet.source} ↗
        </a>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border-[1.5px] border-ink bg-card px-5 py-4 shadow-[4px_5px_0_0_var(--ink)]">
      <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-ink/55">{label}</div>
      <div className="font-semibold mt-1 text-4xl text-ink">{value}</div>
    </div>
  );
}

function shortenUrl(url: string): string {
  try {
    const u = url.startsWith("http") ? new URL(url) : new URL(`https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 30);
  }
}
