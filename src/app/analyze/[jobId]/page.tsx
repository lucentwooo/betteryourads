"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ProgressTracker } from "@/components/ProgressTracker";
import { BrandBreakdown } from "@/components/BrandBreakdown";
import { AdGallery, CompetitorAdGallery } from "@/components/AdGallery";
import { DiagnosisSection } from "@/components/DiagnosisSection";
import { ConceptCards } from "@/components/ConceptCards";
import { StatGrid } from "@/components/StatGrid";
import type { Job } from "@/lib/types";

const SECTIONS: { id: string; num: string; label: string }[] = [
  { id: "brand", num: "01", label: "Brand" },
  { id: "ads", num: "02", label: "Your ads" },
  { id: "rivals", num: "03", label: "Rivals" },
  { id: "diagnosis", num: "04", label: "Diagnosis" },
  { id: "concepts", num: "05", label: "The plan" },
];

export default function AnalyzePage() {
  const params = useParams();
  const jobId = params.jobId as string;
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string>("brand");
  const rootRef = useRef<HTMLElement | null>(null);

  const fetchJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) {
        setError("Job not found");
        return;
      }
      const data = await res.json();
      setJob(data);
    } catch {
      setError("Failed to fetch job status");
    }
  }, [jobId]);

  useEffect(() => {
    fetchJob();
    const interval = setInterval(() => {
      if (job?.status === "complete" || job?.status === "error") {
        clearInterval(interval);
        return;
      }
      fetchJob();
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchJob, job?.status]);

  // Scroll reveals + active-section tracking. Runs once the report renders.
  useEffect(() => {
    if (job?.status !== "complete") return;
    const root = rootRef.current;
    if (!root) return;

    const revealTargets = root.querySelectorAll<HTMLElement>("[data-reveal]");
    const revealIO = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in-view");
            revealIO.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -15% 0px", threshold: 0.12 }
    );
    revealTargets.forEach((el) => revealIO.observe(el));

    const activeTargets = SECTIONS.map((s) =>
      document.getElementById(s.id)
    ).filter((el): el is HTMLElement => !!el);
    const activeIO = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (a.target as HTMLElement).offsetTop - (b.target as HTMLElement).offsetTop);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-40% 0px -50% 0px", threshold: 0 }
    );
    activeTargets.forEach((el) => activeIO.observe(el));

    return () => {
      revealIO.disconnect();
      activeIO.disconnect();
    };
  }, [job?.status]);

  if (error) {
    return (
      <main className="min-h-screen bg-paper flex items-center justify-center">
        <div className="text-center">
          <div className="eyebrow text-ink/60">404</div>
          <h1 className="mt-3 font-serif text-4xl italic">We couldn’t find that job.</h1>
          <p className="mt-3 text-ink/60">{error}</p>
          <Link href="/" className="btn-chunk mt-6 inline-flex">← Start a new diagnosis</Link>
        </div>
      </main>
    );
  }

  if (!job) {
    return (
      <main className="min-h-screen bg-paper flex items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-coral border-t-transparent" />
      </main>
    );
  }

  if (job.status !== "complete") {
    return (
      <main className="min-h-screen bg-paper">
        <div className="mx-auto max-w-2xl px-4">
          <ProgressTracker
            status={job.status}
            progress={job.progress}
            error={job.error}
          />
        </div>
      </main>
    );
  }

  const websiteScreenshotUrl = job.websiteScreenshot
    ? `/api/screenshots/${job.websiteScreenshot.split("data/jobs/").pop()}`
    : undefined;

  const company = job.input?.companyName || "this company";

  return (
    <main ref={rootRef} className="min-h-screen bg-paper text-ink">
      <ProgressRail activeId={activeId} />

      {/* Sticky nav */}
      <header className="sticky top-0 z-20 border-b hairline bg-paper/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-4">
          <Link href="/" className="flex items-baseline gap-[2px] font-serif text-[1.15rem] leading-none">
            <span className="italic">better</span>
            <span className="italic text-coral">your</span>
            <span className="italic">ads</span>
            <span className="ml-1 inline-block h-1.5 w-1.5 translate-y-[-2px] rounded-full bg-coral" />
          </Link>
          <div className="hidden flex-1 items-baseline gap-3 md:flex">
            <span className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-ink/45">
              analysis for
            </span>
            <span className="font-serif text-lg italic text-ink">{company}</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm md:flex">
            {[
              ["brand", "Brand"],
              ["ads", "Ads"],
              ["rivals", "Rivals"],
              ["diagnosis", "Diagnosis"],
              ["concepts", "Concepts"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={`#${href}`}
                className="link-underline text-ink/70 hover:text-ink"
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      {/* Editorial masthead */}
      <section data-reveal className="border-b hairline">
        <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
          <div className="eyebrow text-ink/55">A diagnosis · {new Date(job.completedAt || Date.now()).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</div>
          <h1 className="display mt-5 max-w-4xl text-[clamp(2.5rem,6vw,5.25rem)]">
            What’s happening with{" "}
            <span className="display-italic text-coral">{company}</span>’s ads.
          </h1>
          {job.diagnosis?.tldr && (
            <TldrInline tldr={job.diagnosis.tldr} />
          )}
        </div>

        {/* Stats strip, edge-to-edge, no cards */}
        <div className="mx-auto max-w-6xl px-5 pb-12">
          <StatGrid job={job} />
        </div>
      </section>

      {/* Content */}
      <div className="mx-auto max-w-6xl px-5">
        {job.brandProfile && (
          <Section num="01" label="Brand" id="brand">
            <BrandBreakdown
              brand={job.brandProfile}
              websiteScreenshot={websiteScreenshotUrl}
            />
          </Section>
        )}

        <Section num="02" label="Your ads" id="ads">
          <AdGallery
            title="Your current ads"
            subtitle="Image ads pulled from Meta Ad Library"
            ads={job.companyAds || []}
            jobId={jobId}
            totalCount={job.companyAdCount}
            videoCount={job.companyVideoCount}
            emptyMessage="No ads found in Meta Ad Library. Either you're not running Meta ads right now, or the Library wouldn't let us in."
          />
        </Section>

        {job.competitorData && job.competitorData.length > 0 && (
          <Section num="03" label="Rivals" id="rivals">
            <CompetitorAdGallery
              competitors={job.competitorData}
              jobId={jobId}
            />
          </Section>
        )}

        {(job.diagnosis || job.diagnosis?.recommendedConcepts) && (
          <Section num="04" label="Diagnosis & the plan" id="diagnosis">
            {job.diagnosis && <DiagnosisSection diagnosis={job.diagnosis} />}
            {job.diagnosis?.recommendedConcepts && (
              <div className="mt-24 border-t hairline pt-20">
                <div id="concepts" />
                <ConceptCards
                  conceptsRaw={job.diagnosis.recommendedConcepts}
                  testPlanRaw={job.diagnosis.testPlan}
                />
              </div>
            )}
          </Section>
        )}

        {/* Footer */}
        <footer className="mt-24 flex flex-col items-start justify-between gap-4 border-t hairline py-10 text-sm text-ink/55 md:flex-row md:items-center">
          <span className="font-mono text-xs">
            generated by betteryourads ·{" "}
            {job.completedAt && new Date(job.completedAt).toLocaleString()}
          </span>
          <Link href="/" className="btn-ghost-ink text-sm">
            Run another diagnosis →
          </Link>
        </footer>
      </div>
    </main>
  );
}

/* TL;DR rendered as an editorial numbered list. Parses raw bullet input,
   strips "---" separators and stray ** markup. */
function TldrInline({ tldr }: { tldr: unknown }) {
  const raw =
    typeof tldr === "string"
      ? tldr
      : Array.isArray(tldr)
      ? (tldr as unknown[]).map(String).join("\n")
      : String(tldr ?? "");

  const bullets = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !/^[-*_]{2,}$/.test(l))
    .map((l) => l.replace(/^[-*]\s*/, "").replace(/\*\*/g, "").trim())
    .filter((l) => l.length > 0);

  if (bullets.length === 0) return null;

  return (
    <ol className="mt-10 max-w-3xl space-y-4">
      {bullets.map((b, i) => (
        <li
          key={i}
          className="grid grid-cols-[auto_1fr] items-baseline gap-5 border-b hairline pb-4 last:border-0"
        >
          <span className="font-mono text-[0.72rem] uppercase tracking-[0.2em] text-coral">
            {String(i + 1).padStart(2, "0")}
          </span>
          <span className="font-serif text-[clamp(1.2rem,2vw,1.6rem)] italic leading-[1.35] text-ink/85">
            {b}
          </span>
        </li>
      ))}
    </ol>
  );
}

/* Sticky left-rail table of contents. Auto-advances as sections enter view.
   Hidden below lg so the main column stays centered on smaller screens. */
function ProgressRail({ activeId }: { activeId: string }) {
  const activeIndex = Math.max(
    0,
    SECTIONS.findIndex((s) => s.id === activeId)
  );
  const progress = ((activeIndex + 1) / SECTIONS.length) * 100;

  return (
    <aside
      aria-label="Report progress"
      className="pointer-events-none fixed left-6 top-1/2 z-10 hidden -translate-y-1/2 lg:block"
    >
      <div className="pointer-events-auto flex flex-col items-start gap-5 rounded-2xl border hairline bg-paper/75 px-4 py-5 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-coral" />
          <span className="eyebrow text-ink/55">Consulting</span>
        </div>

        <ol className="space-y-3">
          {SECTIONS.map((s) => {
            const active = s.id === activeId;
            const done =
              SECTIONS.findIndex((x) => x.id === s.id) < activeIndex;
            return (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className={`group flex items-center gap-3 transition ${
                    active
                      ? "text-ink"
                      : done
                      ? "text-ink/50"
                      : "text-ink/35 hover:text-ink/70"
                  }`}
                >
                  <span
                    className={`font-mono text-[0.68rem] tracking-[0.18em] ${
                      active ? "text-coral" : ""
                    }`}
                  >
                    {s.num}
                  </span>
                  <span className="relative">
                    <span className={`font-serif text-base italic ${active ? "" : ""}`}>
                      {s.label}
                    </span>
                    <span
                      className={`absolute left-0 top-full block h-[1.5px] bg-coral transition-all duration-500 ${
                        active ? "w-full" : "w-0"
                      }`}
                    />
                  </span>
                </a>
              </li>
            );
          })}
        </ol>

        <div className="mt-1 h-px w-full bg-hairline" />
        <div className="flex w-full items-center gap-3">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-hairline">
            <div
              className="h-full bg-coral transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="font-mono text-[0.62rem] tabular-nums text-ink/55">
            {activeIndex + 1}/{SECTIONS.length}
          </span>
        </div>
      </div>
    </aside>
  );
}

/* Editorial section — NO bordered card, just a chapter header + breathing room.
   Optional full-bleed blush tone for emphasis sections. */
function Section({
  num,
  label,
  id,
  tone = "paper",
  children,
}: {
  num: string;
  label: string;
  id: string;
  tone?: "paper" | "blush";
  children: React.ReactNode;
}) {
  const toneWrap =
    tone === "blush"
      ? "relative -mx-5 bg-blush px-5 md:-mx-10 md:px-10"
      : "";
  return (
    <section id={id} data-reveal className={`py-16 md:py-24 ${toneWrap}`}>
      <header className="mb-10 flex items-baseline gap-5 border-b hairline pb-4">
        <span className="font-serif text-5xl italic leading-none text-coral md:text-6xl">
          {num}
        </span>
        <span className="font-mono text-[0.72rem] uppercase tracking-[0.22em] text-ink/55">
          · {label}
        </span>
      </header>
      {children}
    </section>
  );
}
