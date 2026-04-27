"use client";

import type { ProgressStep, JobStatus } from "@/lib/types";
import { Check, Loader2 } from "lucide-react";

const STAGE_LABELS: { status: JobStatus; label: string; agent: string }[] = [
  { status: "scraping-website", label: "Scanning site", agent: "Site scraper" },
  { status: "extracting-brand", label: "Extracting brand", agent: "Brand extractor" },
  { status: "scraping-ads", label: "Your Meta ads", agent: "Ad scraper" },
  { status: "scraping-competitor-ads", label: "Competitor ads", agent: "Ad scraper" },
  { status: "voc-research", label: "Voice of Customer", agent: "Researcher" },
  { status: "analyzing", label: "Diagnosis", agent: "Strategist" },
  { status: "concept-architecting", label: "Concepts", agent: "Creative Director" },
  { status: "copywriting", label: "Copy", agent: "Copywriter" },
  { status: "prompt-writing", label: "Prompt crafting", agent: "Art Director" },
  { status: "image-generating", label: "Image generation", agent: "Account Manager" },
  { status: "packaging", label: "Packaging", agent: "Account Manager" },
];

export function ProgressTracker({
  jobId,
  status,
  progress,
  error,
  now,
}: {
  jobId: string;
  status: JobStatus;
  progress: ProgressStep[];
  error?: string;
  now: number;
}) {
  const currentIndex = STAGE_LABELS.findIndex((s) => s.status === status);
  const tail = progress.slice(-14).reverse();
  const lastSignal = progress.at(-1);
  const lastSignalAt = lastSignal ? new Date(lastSignal.timestamp).getTime() : null;
  const quietForSeconds = lastSignalAt
    ? Math.max(0, Math.floor((now - lastSignalAt) / 1000))
    : null;
  const isStale =
    status !== "error" &&
    quietForSeconds !== null &&
    quietForSeconds > 150;
  const isQuiet =
    status !== "error" &&
    quietForSeconds !== null &&
    quietForSeconds > 45 &&
    !isStale;
  const statusLabel = isStale
    ? "No backend signal recently"
    : isQuiet
    ? "Long-running stage"
    : "Receiving updates";

  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      <div className="eyebrow text-coral">In progress</div>
      <h1 className="display mt-4 text-[clamp(2.2rem,4.5vw,3.5rem)]">
        Six specialists,{" "}
        <span className="display-italic text-coral">working</span> in sequence.
      </h1>
      <p className="mt-4 max-w-xl text-lg text-ink/70">
        Each stage runs a generator agent, then a strict QA reviewer. Bad output never passes through.
      </p>

      <section
        className={`mt-6 rounded-2xl border-[1.5px] px-4 py-3 text-sm ${
          isStale
            ? "border-coral bg-coral/10"
            : isQuiet
            ? "border-butter bg-butter/20"
            : "border-ink/15 bg-card"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-ink/45">
              Job health
            </div>
            <div className="mt-1 font-semibold text-ink">{statusLabel}</div>
          </div>
          <div className="font-mono text-[0.72rem] uppercase tracking-[0.14em] text-ink/55">
            {quietForSeconds === null
              ? "Waiting for first signal"
              : `Last signal ${formatAge(quietForSeconds)} ago`}
          </div>
        </div>
        <div className="mt-2 grid gap-1 font-mono text-[0.72rem] text-ink/55 sm:grid-cols-2">
          <span>Job: {jobId}</span>
          <span>Stage: {status}</span>
        </div>
        {isStale && (
          <p className="mt-3 text-ink/70">
            This is probably stuck. Refresh once; if it still shows this warning,
            start a new run or check the job JSON at{" "}
            <a className="underline" href={`/api/jobs/${jobId}`} target="_blank">
              /api/jobs/{jobId}
            </a>
            .
          </p>
        )}
      </section>

      {error && (
        <div className="mt-6 rounded-xl border-[1.5px] border-coral bg-coral/10 px-4 py-3 text-sm text-ink">
          {error}
        </div>
      )}

      <div className="mt-12 grid gap-2">
        {STAGE_LABELS.map((s, i) => {
          const state =
            i < currentIndex ? "done" : i === currentIndex ? "active" : "pending";
          return (
            <div
              key={s.status}
              className={`grid grid-cols-[2rem_10rem_1fr_auto] items-center gap-4 rounded-xl border-[1.5px] px-4 py-3 ${
                state === "active"
                  ? "border-ink bg-card shadow-[3px_4px_0_0_var(--ink)]"
                  : state === "done"
                  ? "border-ink/20 bg-paper"
                  : "border-ink/10 bg-paper/60"
              }`}
            >
              <span className="grid h-7 w-7 place-items-center rounded-full border-[1.5px] border-ink/50">
                {state === "done" && <Check className="h-4 w-4 text-sage" />}
                {state === "active" && <Loader2 className="h-4 w-4 animate-spin text-coral" />}
                {state === "pending" && <span className="h-1.5 w-1.5 rounded-full bg-ink/25" />}
              </span>
              <span className={`font-serif text-lg italic ${state === "pending" ? "text-ink/45" : "text-ink"}`}>
                {s.label}
              </span>
              <span className="hidden font-mono text-[0.65rem] uppercase tracking-[0.2em] text-ink/50 md:block">
                {s.agent}
              </span>
              <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ink/50">
                {state}
              </span>
            </div>
          );
        })}
      </div>

      <section className="mt-12">
        <div className="eyebrow text-ink/60">Live agent feed</div>
        <ol className="mt-4 space-y-2 rounded-2xl border-[1.5px] border-ink bg-card p-5 font-mono text-[0.82rem] leading-relaxed text-ink/80">
          {tail.length === 0 && <li className="text-ink/40">Waiting for the first signal…</li>}
          {tail.map((p, i) => (
            <li key={i} className="grid grid-cols-[5rem_1fr] gap-3 border-b border-hairline/60 py-1 last:border-0">
              <span className="text-ink/45">
                {p.agent ?? "system"}
                {p.qaOutcome && (
                  <span
                    className={`ml-1 inline-block rounded px-1 text-[0.65rem] ${
                      p.qaOutcome === "pass"
                        ? "bg-sage/30 text-sage"
                        : p.qaOutcome === "retry"
                        ? "bg-butter text-ink"
                        : "bg-coral/20 text-coral"
                    }`}
                  >
                    {p.qaOutcome}
                  </span>
                )}
              </span>
              <span>
                <span className="text-ink">{p.step}</span>
                {p.detail && <span className="text-ink/60"> — {p.detail}</span>}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}
