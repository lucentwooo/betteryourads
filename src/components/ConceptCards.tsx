"use client";

import { useState, useTransition } from "react";
import { Check, X, ArrowUp, ArrowDown, Sparkles } from "lucide-react";
import type { Concept, AwarenessStage } from "@/lib/types";

const STAGE_TONE: Record<AwarenessStage, { bg: string; ink: string; label: string }> = {
  unaware:   { bg: "bg-blush",  ink: "text-ink",   label: "Unaware" },
  problem:   { bg: "bg-coral",  ink: "text-white", label: "Problem" },
  solution:  { bg: "bg-butter", ink: "text-ink",   label: "Solution" },
  product:   { bg: "bg-sage",   ink: "text-white", label: "Product" },
  most:      { bg: "bg-ink",    ink: "text-paper", label: "Most aware" },
};

interface Props {
  jobId: string;
  concepts: Concept[];
  readOnly?: boolean;
}

type Draft = Record<string, { approved: Concept["approved"]; priority: number }>;

export function ConceptCards({ jobId, concepts, readOnly = false }: Props) {
  const [draft, setDraft] = useState<Draft>(() => {
    const d: Draft = {};
    for (const c of concepts) d[c.id] = { approved: c.approved, priority: c.priority };
    return d;
  });
  const [isPending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const sorted = [...concepts].sort(
    (a, b) => (draft[a.id]?.priority ?? a.priority) - (draft[b.id]?.priority ?? b.priority),
  );

  const approvedCount = Object.values(draft).filter((d) => d.approved === "approved").length;

  async function persist(next: Draft) {
    setDraft(next);
    if (readOnly) return;
    startTransition(async () => {
      await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concepts: Object.entries(next).map(([id, d]) => ({ id, ...d })),
        }),
      });
      setSavedAt(new Date().toLocaleTimeString());
    });
  }

  function setApproval(id: string, approved: Concept["approved"]) {
    persist({ ...draft, [id]: { ...draft[id], approved } });
  }

  function move(id: string, dir: -1 | 1) {
    const idx = sorted.findIndex((c) => c.id === id);
    const swapWith = sorted[idx + dir];
    if (!swapWith) return;
    const next = { ...draft };
    const a = next[id].priority;
    next[id] = { ...next[id], priority: next[swapWith.id].priority };
    next[swapWith.id] = { ...next[swapWith.id], priority: a };
    persist(next);
  }

  return (
    <div className="space-y-12">
      {/* Intro row — framing prose + approval counter. The big headline for this
         section is rendered by SubSectionHeader in the analyze page, so no H2 here. */}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <p className="max-w-xl text-[1rem] leading-relaxed text-ink/70 md:text-[1.05rem]">
          Six to eight concepts, ranked. Approve the ones you want to test — the creative team ships those next.
        </p>
        {!readOnly && (
          <div className="rounded-2xl border-[1.5px] border-ink bg-card px-5 py-4 shadow-[4px_5px_0_0_var(--ink)]">
            <div className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-ink/55">Approved</div>
            <div className="font-semibold mt-1 text-4xl text-ink">
              {approvedCount}<span className="text-ink/40">/{concepts.length}</span>
            </div>
            {savedAt && <div className="mt-1 font-mono text-[0.65rem] text-ink/50">saved {savedAt}</div>}
            {isPending && <div className="mt-1 font-mono text-[0.65rem] text-ink/50">saving…</div>}
          </div>
        )}
      </div>

      {/* List */}
      <ol className="divide-y divide-hairline border-y hairline">
        {sorted.map((c, i) => {
          const state = draft[c.id];
          const tone = STAGE_TONE[c.awarenessStage] ?? STAGE_TONE.problem;
          const isApproved = state?.approved === "approved";
          const isRejected = state?.approved === "rejected";
          return (
            <li key={c.id} className={isRejected ? "opacity-45" : ""}>
              <div className="grid grid-cols-[3rem_1fr_auto] items-start gap-4 py-7 md:grid-cols-[4.5rem_1fr_auto] md:gap-8">
                <span className="font-semibold text-4xl leading-none text-coral md:text-5xl">
                  {String(i + 1).padStart(2, "0")}
                </span>

                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={`inline-block rounded-full border-[1.5px] border-ink px-2.5 py-1 font-mono text-[0.6rem] font-semibold uppercase tracking-widest ${tone.bg} ${tone.ink}`}>
                      {tone.label}
                    </span>
                    <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-ink/50">
                      {c.framework}
                    </span>
                  </div>
                  <h4 className="font-semibold text-[clamp(1.35rem,2.2vw,1.9rem)] leading-[1.2] text-ink">
                    {c.name}
                  </h4>
                  <p className="mt-3 text-[0.98rem] leading-relaxed text-ink/80">{c.angle}</p>

                  <details className="group mt-4">
                    <summary className="inline-flex cursor-pointer items-center gap-2 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-ink/50 hover:text-ink">
                      <Sparkles className="h-3.5 w-3.5" />
                      Why this concept
                    </summary>
                    <div className="mt-3 space-y-3 rounded-xl border hairline bg-paper/60 p-4 text-[0.92rem] leading-relaxed text-ink/80">
                      <p>{c.rationale}</p>
                      <div className="grid gap-3 text-[0.85rem] sm:grid-cols-2">
                        <div>
                          <div className="eyebrow text-ink/50">Diagnosis finding</div>
                          <div className="mt-1 text-ink/80">{c.diagnosisFindingRef}</div>
                        </div>
                        {c.vocPatternRefs.length > 0 && (
                          <div>
                            <div className="eyebrow text-ink/50">VoC patterns</div>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {c.vocPatternRefs.map((r) => (
                                <span key={r} className="rounded-full bg-butter/50 px-2 py-0.5 font-mono text-[0.65rem] text-ink">
                                  {r}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </details>
                </div>

                {!readOnly && (
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex gap-1.5">
                      <IconBtn
                        label="Move up"
                        onClick={() => move(c.id, -1)}
                        disabled={i === 0}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </IconBtn>
                      <IconBtn
                        label="Move down"
                        onClick={() => move(c.id, 1)}
                        disabled={i === sorted.length - 1}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </IconBtn>
                    </div>
                    <div className="flex gap-2">
                      <ApprovalBtn
                        active={isApproved}
                        onClick={() => setApproval(c.id, isApproved ? "pending" : "approved")}
                        tone="approve"
                      >
                        <Check className="h-3.5 w-3.5" /> Approve
                      </ApprovalBtn>
                      <ApprovalBtn
                        active={isRejected}
                        onClick={() => setApproval(c.id, isRejected ? "pending" : "rejected")}
                        tone="reject"
                      >
                        <X className="h-3.5 w-3.5" /> Skip
                      </ApprovalBtn>
                    </div>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {!readOnly && (
        <StickyCTA approvedCount={approvedCount} jobId={jobId} />
      )}
    </div>
  );
}

/* ───────── subcomponents ───────── */

function IconBtn({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-8 w-8 place-items-center rounded-lg border-[1.5px] border-ink/15 bg-card text-ink/60 transition hover:border-ink hover:bg-paper hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-ink/15 disabled:hover:bg-card disabled:hover:text-ink/60"
    >
      {children}
    </button>
  );
}

function ApprovalBtn({
  children,
  onClick,
  active,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  tone: "approve" | "reject";
}) {
  const activeStyles =
    tone === "approve"
      ? "bg-sage text-white border-sage shadow-[2px_3px_0_0_var(--ink)]"
      : "bg-ink text-paper border-ink shadow-[2px_3px_0_0_var(--ink)]";
  const idleStyles = "bg-card text-ink border-ink/15 hover:border-ink";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border-[1.5px] px-3 py-1.5 font-mono text-[0.7rem] font-semibold uppercase tracking-[0.12em] transition ${
        active ? activeStyles : idleStyles
      }`}
    >
      {children}
    </button>
  );
}

function StickyCTA({ approvedCount, jobId }: { approvedCount: number; jobId: string }) {
  const disabled = approvedCount === 0;
  return (
    <div className="sticky bottom-6 z-30">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 rounded-2xl border-[1.5px] border-ink bg-ink px-5 py-4 text-paper shadow-[6px_8px_0_0_rgba(26,25,21,0.85)]">
        <div>
          <div className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-paper/55">
            {approvedCount === 0 ? "Pick what to ship" : `${approvedCount} approved`}
          </div>
          <div className="font-semibold text-lg">
            {approvedCount === 0 ? "Approve at least one to generate creatives" : "Ready when you are"}
          </div>
        </div>
        <button
          disabled={disabled}
          onClick={async () => {
            if (disabled) return;
            await fetch(`/api/jobs/${jobId}/generate`, { method: "POST" }).catch(() => {});
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-coral px-5 py-3 font-semibold text-white transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
        >
          Generate creatives →
        </button>
      </div>
    </div>
  );
}

