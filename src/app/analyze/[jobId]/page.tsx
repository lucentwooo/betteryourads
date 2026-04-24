"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ProgressTracker } from "@/components/ProgressTracker";
import { BrandBreakdown } from "@/components/BrandBreakdown";
import { AdGallery, CompetitorAdGallery } from "@/components/AdGallery";
import { DiagnosisSection } from "@/components/DiagnosisSection";
import { ConceptCards } from "@/components/ConceptCards";
import { CreativeGallery } from "@/components/CreativeGallery";
import { VocSection } from "@/components/VocSection";
import { StatGrid } from "@/components/StatGrid";
import type { Job } from "@/lib/types";

const SECTIONS: { id: string; num: string; label: string }[] = [
  { id: "brand", num: "01", label: "Brand" },
  { id: "ads", num: "02", label: "Your ads" },
  { id: "rivals", num: "03", label: "Rivals" },
  { id: "voc", num: "04", label: "Voice of Customer" },
  { id: "diagnosis", num: "05", label: "Diagnosis" },
  { id: "concepts", num: "06", label: "The plan" },
];

export default function AnalyzePage() {
  const params = useParams();
  const jobId = params.jobId as string;
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string>("brand");
  const rootRef = useRef<HTMLElement | null>(null);
  const advancingRef = useRef(false);

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
      if (
        job?.status === "complete" ||
        job?.status === "awaiting-approval" ||
        job?.status === "error"
      ) {
        clearInterval(interval);
        return;
      }
      fetchJob();
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchJob, job?.status]);

  useEffect(() => {
    if (
      !job ||
      job.status === "complete" ||
      job.status === "awaiting-approval" ||
      job.status === "error" ||
      advancingRef.current
    ) {
      return;
    }

    const justStartedScanner =
      job.status === "scraping-website" &&
      job.progress.length <= 1 &&
      Date.now() - new Date(job.createdAt).getTime() < 10_000;
    if (justStartedScanner) return;

    let cancelled = false;
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    async function advanceUntilDone() {
      advancingRef.current = true;
      try {
        while (!cancelled) {
          const res = await fetch(`/api/jobs/${jobId}/advance`, {
            method: "POST",
          });
          const data = (await res.json().catch(() => ({}))) as {
            done?: boolean;
            status?: Job["status"];
          };

          await fetchJob();

          if (
            !res.ok ||
            data.done ||
            data.status === "complete" ||
            data.status === "awaiting-approval" ||
            data.status === "error"
          ) {
            break;
          }

          await delay(250);
        }
      } catch (err) {
        console.error("[analyze] advance failed; polling will keep retrying", err);
        await delay(2000);
      } finally {
        advancingRef.current = false;
      }
    }

    void advanceUntilDone();
    return () => {
      cancelled = true;
    };
  }, [fetchJob, job, jobId]);

  // Scroll reveals + active-section tracking. Runs once the report renders.
  useEffect(() => {
    if (job?.status !== "complete" && job?.status !== "awaiting-approval") return;
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
          <h1 className="font-semibold mt-3 text-4xl">We couldn’t find that job.</h1>
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

  if (job.status !== "complete" && job.status !== "awaiting-approval") {
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

  // Blob URLs come back as full https; legacy local paths contain "data/jobs/".
  const websiteScreenshotUrl = job.websiteScreenshot
    ? job.websiteScreenshot.includes("data/jobs/")
      ? `/api/screenshots/${job.websiteScreenshot.split("data/jobs/").pop()}`
      : job.websiteScreenshot
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
            <span className="font-semibold text-lg text-ink">{company}</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm md:flex">
            {[
              ["brand", "Brand"],
              ["ads", "Ads"],
              ["rivals", "Rivals"],
              ["voc", "VoC"],
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
          <Section
            num="01"
            label="Brand"
            id="brand"
            title="Your brand, {em}."
            emphasis="extracted"
            kicker="Palette, typography, and voice — pulled live from your site so every concept looks like you, not like an AI guessed."
          >
            <BrandBreakdown
              brand={job.brandProfile}
              websiteScreenshot={websiteScreenshotUrl}
            />
          </Section>
        )}

        <Section
          num="02"
          label="Your ads"
          id="ads"
          title="The ads you're {em}."
          emphasis="running"
          kicker="Every live Meta creative we could pull from the Ad Library, tagged by awareness stage."
        >
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
          <Section
            num="03"
            label="Rivals"
            id="rivals"
            title="The ads they're {em} you with."
            emphasis="beating"
            kicker="Active creative from your real competitors — sorted, so you can see what's quietly printing money in your category."
          >
            <CompetitorAdGallery
              competitors={job.competitorData}
              jobId={jobId}
            />
          </Section>
        )}

        {job.voc && (job.voc.snippets.length > 0 || job.voc.painPoints.length > 0) && (
          <Section
            num="04"
            label="Voice of Customer"
            id="voc"
            title="The words your customers {em} use."
            emphasis="actually"
            kicker="Direct quotes from Reddit, G2, Trustpilot, and niche forums. Real language, linked to real sources."
          >
            <VocSection voc={job.voc} />
          </Section>
        )}

        {job.diagnosis && (
          <Section
            num="05"
            label="Diagnosis & the plan"
            id="diagnosis"
            title="What's {em}, what's not, and what to ship."
            emphasis="working"
            kicker="The read on your creative, the gaps your rivals are filling, and a ranked plan you can hand to your editor."
          >
            <DiagnosisSection diagnosis={job.diagnosis} />
            {job.concepts && job.concepts.length > 0 && (
              <div className="mt-24 border-t hairline pt-16">
                <SubSectionHeader
                  eyebrow="The plan"
                  title="Concepts, {em}."
                  emphasis="ranked"
                  id="concepts"
                />
                <ConceptCards
                  jobId={jobId}
                  concepts={job.concepts}
                  readOnly={job.status === "complete"}
                />
              </div>
            )}
            {job.creatives && job.creatives.length > 0 && (
              <div className="mt-24 border-t hairline pt-16">
                <SubSectionHeader
                  eyebrow="Creatives"
                  title="Your concepts, {em}."
                  emphasis="drawn"
                  id="creatives"
                />
                <CreativeGallery
                  jobId={jobId}
                  creatives={job.creatives}
                  concepts={job.concepts || []}
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
    .map((l) => l.replace(/^[-*•·▸▹‣–—]\s*/, "").replace(/\*\*/g, "").trim())
    .filter((l) => l.length > 0);

  if (bullets.length === 0) return null;

  return (
    <ol className="mt-10 max-w-2xl space-y-3">
      {bullets.map((b, i) => (
        <li
          key={i}
          className="grid grid-cols-[auto_1fr] items-baseline gap-4 border-b hairline pb-3 last:border-0"
        >
          <span className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-coral">
            {String(i + 1).padStart(2, "0")}
          </span>
          <span className="text-[1rem] leading-[1.55] text-ink/85 md:text-[1.05rem]">
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
      className="pointer-events-none fixed left-4 top-1/2 z-10 hidden -translate-y-1/2 2xl:block"
    >
      <div className="pointer-events-auto flex flex-col items-start gap-2">
        <ol className="space-y-1.5">
          {SECTIONS.map((s) => {
            const active = s.id === activeId;
            const done =
              SECTIONS.findIndex((x) => x.id === s.id) < activeIndex;
            return (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="group flex items-center gap-2.5 py-1 transition"
                  aria-current={active ? "true" : undefined}
                >
                  <span
                    className={`block h-[2px] transition-all duration-500 ${
                      active
                        ? "w-7 bg-coral"
                        : done
                        ? "w-4 bg-ink/40"
                        : "w-3 bg-ink/15 group-hover:bg-ink/40"
                    }`}
                  />
                  <span
                    className={`font-mono text-[0.62rem] uppercase tracking-[0.18em] transition-opacity ${
                      active
                        ? "text-ink"
                        : done
                        ? "text-ink/55"
                        : "text-ink/30 group-hover:text-ink/60"
                    }`}
                  >
                    {s.label}
                  </span>
                </a>
              </li>
            );
          })}
        </ol>

        <div className="mt-2 flex items-center gap-2 pl-[0.15rem]">
          <div className="h-[2px] w-12 overflow-hidden bg-hairline">
            <div
              className="h-full bg-coral transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="font-mono text-[0.6rem] tabular-nums text-ink/45">
            {activeIndex + 1}/{SECTIONS.length}
          </span>
        </div>
      </div>
    </aside>
  );
}

/* Editorial section — NO bordered card, just a chapter header + breathing room.
   Optional full-bleed blush tone for emphasis sections. */
function SubSectionHeader({
  eyebrow,
  title,
  emphasis,
  id,
}: {
  eyebrow: string;
  title: string;
  emphasis?: string;
  id?: string;
}) {
  const [before, after] = emphasis && title.includes("{em}")
    ? title.split("{em}")
    : [title, ""];
  return (
    <header id={id} className="mb-12">
      <div className="eyebrow text-ink/55">{eyebrow}</div>
      <h3 className="display mt-3 text-[clamp(1.75rem,3.4vw,2.75rem)] leading-[1.05] [text-wrap:balance]">
        {before}
        {emphasis && <span className="display-italic text-coral">{emphasis}</span>}
        {after}
      </h3>
    </header>
  );
}

function Section({
  num,
  label,
  id,
  tone = "paper",
  title,
  emphasis,
  kicker,
  children,
}: {
  num: string;
  label: string;
  id: string;
  tone?: "paper" | "blush";
  /** Big editorial headline. Supports a single `{em}` token replaced by `emphasis`
   *  rendered as coral italic — matches the HowItWorks display treatment. */
  title?: string;
  emphasis?: string;
  kicker?: string;
  children: React.ReactNode;
}) {
  const toneWrap =
    tone === "blush"
      ? "relative -mx-5 bg-blush px-5 md:-mx-10 md:px-10"
      : "";

  const [before, after] = title && emphasis && title.includes("{em}")
    ? title.split("{em}")
    : [title ?? "", ""];

  return (
    <section id={id} data-reveal className={`py-20 md:py-28 ${toneWrap}`}>
      <header className="mb-12 md:mb-16">
        <div className="grid grid-cols-[auto_1fr] items-start gap-6 md:gap-10">
          <span className="font-semibold text-6xl leading-[0.9] text-coral md:text-7xl">
            {num}
          </span>
          <div className="min-w-0 border-l hairline pl-6 md:pl-10">
            <div className="font-mono text-[0.72rem] uppercase tracking-[0.22em] text-ink/55">
              {label}
            </div>
            {title && (
              <h2 className="display mt-3 text-[clamp(2rem,4.2vw,3.75rem)] leading-[1.02] [text-wrap:balance]">
                {before}
                {emphasis && (
                  <span className="display-italic text-coral">{emphasis}</span>
                )}
                {after}
              </h2>
            )}
            {kicker && (
              <p className="mt-5 max-w-2xl text-[1rem] leading-relaxed text-ink/65 md:text-[1.05rem]">
                {kicker}
              </p>
            )}
          </div>
        </div>
      </header>
      {children}
    </section>
  );
}
