"use client";

import { useState } from "react";
import { Download, CheckCircle2, AlertTriangle, X, Sparkles } from "lucide-react";
import type { Creative, Concept, VocPatternRef } from "@/lib/types";

interface Props {
  jobId: string;
  creatives: Creative[];
  concepts: Concept[];
}

export function CreativeGallery({ jobId, creatives, concepts }: Props) {
  const [selected, setSelected] = useState<Creative | null>(null);

  const conceptById = new Map(concepts.map((c) => [c.id, c]));

  if (creatives.length === 0) return null;

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-3xl">
          <div className="eyebrow text-coral">The creatives</div>
          <h3 className="display mt-4 text-[clamp(2rem,4vw,3.25rem)]">
            Ready to <span className="display-italic text-coral">ship</span>.
          </h3>
          <p className="mt-4 text-lg text-ink/70">
            Every creative is grounded in a specific VoC pattern + diagnosis finding. Click any to see why.
          </p>
        </div>
        <a
          href={`/api/jobs/${jobId}/export`}
          className="inline-flex items-center gap-2 rounded-xl border-[1.5px] border-ink bg-ink px-5 py-3 font-semibold text-paper transition hover:translate-y-[-1px] shadow-[4px_5px_0_0_rgba(26,25,21,0.5)]"
        >
          <Download className="h-4 w-4" /> Download pack (ZIP)
        </a>
      </header>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {creatives.map((c) => {
          const concept = conceptById.get(c.conceptId);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelected(c)}
              className="group text-left"
            >
              <div className="overflow-hidden rounded-[1.4rem] border-[1.5px] border-ink bg-card shadow-[4px_5px_0_0_var(--ink)] transition group-hover:translate-y-[-2px] group-hover:shadow-[6px_7px_0_0_var(--ink)]">
                <div className="relative aspect-square overflow-hidden bg-paper">
                  {c.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.imageUrl} alt={concept?.name ?? c.id} className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-ink/40 text-sm">
                      {c.status === "failed" ? "Failed" : "Rendering…"}
                    </div>
                  )}
                  <div className="absolute left-3 top-3 flex gap-2">
                    <QaBadge creative={c} />
                  </div>
                </div>
                <div className="border-t-[1.5px] border-ink px-4 py-3">
                  <div className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-ink/55">
                    {concept?.awarenessStage} · {c.register} · track {c.track}
                  </div>
                  <div className="font-semibold mt-1 truncate text-lg text-ink">{concept?.name}</div>
                  <div className="mt-2 line-clamp-2 text-sm text-ink/70">{c.copy.headline}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selected && (
        <CreativeDetail
          creative={selected}
          concept={conceptById.get(selected.conceptId)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function QaBadge({ creative }: { creative: Creative }) {
  if (!creative.qa) return null;
  if (creative.qa.pass) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-ink bg-sage/90 px-2 py-0.5 font-mono text-[0.65rem] font-semibold text-paper">
        <CheckCircle2 className="h-3 w-3" /> QA {creative.qa.score}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-ink bg-butter px-2 py-0.5 font-mono text-[0.65rem] font-semibold text-ink">
      <AlertTriangle className="h-3 w-3" /> flagged {creative.qa.score}
    </span>
  );
}

function CreativeDetail({
  creative,
  concept,
  onClose,
}: {
  creative: Creative;
  concept?: Concept;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-stretch justify-end bg-ink/40 backdrop-blur-sm" onClick={onClose}>
      <aside
        className="ml-auto flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l-[1.5px] border-ink bg-paper shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 flex items-center justify-between gap-3 border-b-[1.5px] border-ink bg-paper px-6 py-4">
          <div>
            <div className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-ink/55">
              {concept?.awarenessStage} · track {creative.track}
            </div>
            <div className="font-semibold mt-1 text-xl text-ink">{concept?.name}</div>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full border-[1.5px] border-ink bg-card hover:bg-coral hover:text-paper"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-8 px-6 py-6">
          {creative.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={creative.imageUrl}
              alt=""
              className="w-full rounded-2xl border-[1.5px] border-ink shadow-[6px_8px_0_0_var(--ink)]"
            />
          )}

          <section>
            <div className="eyebrow text-coral">Copy</div>
            <dl className="mt-3 space-y-3 rounded-2xl border-[1.5px] border-ink bg-card p-5">
              <CopyRow label="Primary" value={creative.copy.primary} />
              <CopyRow label="Headline" value={creative.copy.headline} />
              <CopyRow label="Description" value={creative.copy.description} />
              <CopyRow label="CTA" value={creative.copy.cta} />
            </dl>
            {creative.copy.vocLanguageUsed.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {creative.copy.vocLanguageUsed.map((t) => (
                  <span key={t} className="rounded-full bg-butter/70 px-2.5 py-1 font-mono text-[0.65rem] text-ink">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </section>

          {creative.whyThisCreative && (
            <section>
              <div className="eyebrow text-coral inline-flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Why this creative
              </div>
              <div className="mt-3 space-y-4 rounded-2xl border-[1.5px] border-ink bg-card p-5 text-[0.95rem]">
                <div>
                  <div className="eyebrow text-ink/55">Diagnosis finding</div>
                  <div className="mt-1 text-ink/85">{creative.whyThisCreative.diagnosisFinding}</div>
                </div>
                <VocBlock pattern={creative.whyThisCreative.vocPattern} />
                {creative.whyThisCreative.referenceAds.length > 0 && (
                  <div>
                    <div className="eyebrow text-ink/55">Modeled on</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {creative.whyThisCreative.referenceAds.map((r) => (
                        <span key={r} className="rounded-full bg-ink px-2.5 py-0.5 font-mono text-[0.65rem] text-paper">
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <div className="eyebrow text-ink/55">Framework</div>
                  <div className="mt-1 text-ink/85">{creative.whyThisCreative.frameworksApplied.join(", ")}</div>
                </div>
              </div>
            </section>
          )}

          {creative.qa && (
            <section>
              <div className="eyebrow text-coral">QA scorecard</div>
              <div className="mt-3 rounded-2xl border-[1.5px] border-ink bg-card p-5">
                <div className="flex items-baseline justify-between">
                  <div className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-ink/55">
                    {creative.qa.pass ? "Passed" : "Flagged"}
                  </div>
                  <div className="font-semibold text-3xl text-ink">{creative.qa.score}/10</div>
                </div>
                {creative.qa.rubric && (
                  <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {Object.entries(creative.qa.rubric).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between border-b border-hairline/60 py-1">
                        <span className="text-ink/70">{k}</span>
                        <span className="font-mono text-ink">{v}</span>
                      </div>
                    ))}
                  </div>
                )}
                {creative.qa.issues.length > 0 && (
                  <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-ink/70">
                    {creative.qa.issues.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-start gap-4 border-b border-hairline pb-3 last:border-0 last:pb-0">
      <dt className="eyebrow text-ink/55">
        {label} <span className="font-mono text-[0.6rem] text-ink/40">({value.length})</span>
      </dt>
      <dd className="text-[0.95rem] leading-relaxed text-ink">{value || <span className="text-ink/30">—</span>}</dd>
    </div>
  );
}

function VocBlock({ pattern }: { pattern: VocPatternRef }) {
  return (
    <div>
      <div className="eyebrow text-ink/55">VoC pattern driving the angle</div>
      <div className="mt-1 text-ink/85">{pattern.patternName}</div>
      {pattern.quote && (
        <blockquote className="font-semibold mt-2 border-l-2 border-coral pl-3 text-base leading-relaxed text-ink/75">
          &ldquo;{pattern.quote}&rdquo;
          {pattern.url && (
            <a
              href={pattern.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 font-mono text-[0.7rem] not-italic text-coral hover:underline"
            >
              {pattern.source} ↗
            </a>
          )}
        </blockquote>
      )}
    </div>
  );
}
