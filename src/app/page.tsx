"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpRight, Check, Loader2, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Step = "input" | "competitors" | "submitting";

interface CompetitorSuggestion {
  name: string;
  searchTerm: string;
}

export default function HomePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("input");
  const [demoMode, setDemoMode] = useState(false);
  const [cheapMode, setCheapMode] = useState(false);

  const [companyName, setCompanyName] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [landingPageUrl, setLandingPageUrl] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [icpDescription, setIcpDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [adContentDescription, setAdContentDescription] = useState("");
  const [showOptional, setShowOptional] = useState(false);

  const [suggestedCompetitors, setSuggestedCompetitors] = useState<CompetitorSuggestion[]>([]);
  const [customCompetitor, setCustomCompetitor] = useState("");
  const [loadingCompetitors, setLoadingCompetitors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setDemoMode(
      params.get("demo") === "1" ||
        process.env.NEXT_PUBLIC_DEMO_MODE === "1"
    );
    setCheapMode(params.get("cheap") === "1");
  }, []);

  useEffect(() => {
    if (!demoMode) return;
    setCompanyName((v) => v || "Tally");
    setCompanyUrl((v) => v || "https://tally.so");
    setSuggestedCompetitors((v) =>
      v.length
        ? v
        : [
            { name: "Typeform", searchTerm: "Typeform" },
            { name: "Jotform", searchTerm: "Jotform" },
            { name: "Google Forms", searchTerm: "Google Forms" },
          ]
    );
  }, [demoMode]);

  async function handleInitialSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyName || !companyUrl) return;
    if (demoMode || cheapMode) {
      setStep("competitors");
      return;
    }
    setLoadingCompetitors(true);
    setStep("competitors");
    try {
      const res = await fetch("/api/suggest-competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, companyUrl }),
      });
      const data = await res.json();
      setSuggestedCompetitors(data.competitors || []);
      if (data.error) setApiError(data.error);
    } catch {
      setSuggestedCompetitors([]);
    } finally {
      setLoadingCompetitors(false);
    }
  }

  function removeCompetitor(i: number) {
    setSuggestedCompetitors((prev) => prev.filter((_, idx) => idx !== i));
  }
  function addCompetitor() {
    if (!customCompetitor.trim()) return;
    setSuggestedCompetitors((p) => [
      ...p,
      { name: customCompetitor.trim(), searchTerm: customCompetitor.trim() },
    ]);
    setCustomCompetitor("");
  }

  async function handleAnalyze() {
    setSubmitting(true);
    setStep("submitting");
    try {
      const res = await fetch(demoMode ? "/api/mock-analyze" : "/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          companyUrl,
          landingPageUrl: landingPageUrl || undefined,
          productDescription: productDescription || undefined,
          icpDescription: icpDescription || undefined,
          notes: notes || undefined,
          adContentDescription: adContentDescription || undefined,
          competitors: cheapMode
            ? suggestedCompetitors.slice(0, 1).map((c) => c.name)
            : suggestedCompetitors.map((c) => c.name),
          testMode: cheapMode ? "cheap" : undefined,
        }),
      });
      const data = await res.json();
      router.push(`/analyze/${data.jobId}`);
    } catch {
      setSubmitting(false);
      setStep("competitors");
    }
  }

  return (
    <main className="min-h-screen bg-paper text-ink overflow-x-hidden">
      <TopNav />

      <Hero
        step={step}
        submitting={submitting}
        loadingCompetitors={loadingCompetitors}
        companyName={companyName}
        setCompanyName={setCompanyName}
        companyUrl={companyUrl}
        setCompanyUrl={setCompanyUrl}
        landingPageUrl={landingPageUrl}
        setLandingPageUrl={setLandingPageUrl}
        productDescription={productDescription}
        setProductDescription={setProductDescription}
        icpDescription={icpDescription}
        setIcpDescription={setIcpDescription}
        notes={notes}
        setNotes={setNotes}
        adContentDescription={adContentDescription}
        setAdContentDescription={setAdContentDescription}
        showOptional={showOptional}
        setShowOptional={setShowOptional}
        suggestedCompetitors={suggestedCompetitors}
        customCompetitor={customCompetitor}
        setCustomCompetitor={setCustomCompetitor}
        apiError={apiError}
        demoMode={demoMode}
        cheapMode={cheapMode}
        onInitialSubmit={handleInitialSubmit}
        onAddCompetitor={addCompetitor}
        onRemoveCompetitor={removeCompetitor}
        onAnalyze={handleAnalyze}
        onBack={() => setStep("input")}
      />

      <TrustStrip />
      <Triptych />
      <HowItWorks />
      <SamplePeek />
      <FounderNote />
      <FinalCta onScrollTop={() => window.scrollTo({ top: 0, behavior: "smooth" })} />
      <Footer />
    </main>
  );
}

/* ───────────────────────── Nav ───────────────────────── */

function TopNav() {
  return (
    <header className="sticky top-0 z-40 border-b hairline bg-paper/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="#" className="flex items-center gap-2">
          <Wordmark />
        </a>
        <nav className="hidden gap-8 text-sm text-ink/70 md:flex">
          <a href="#what" className="link-underline">What you get</a>
          <a href="#how" className="link-underline">How it works</a>
          <a href="#sample" className="link-underline">Sample</a>
          <a href="#founder" className="link-underline">Why</a>
        </nav>
        <a href="#start" className="btn-ghost-ink text-sm">
          Diagnose my ads
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </header>
  );
}

function Wordmark() {
  return (
    <span className="flex items-baseline gap-[2px] font-serif text-[1.35rem] leading-none">
      <span className="italic">better</span>
      <span className="text-coral italic">your</span>
      <span className="italic">ads</span>
      <span className="ml-1 inline-block h-1.5 w-1.5 translate-y-[-2px] rounded-full bg-coral" />
    </span>
  );
}

/* ───────────────────────── Hero ───────────────────────── */

type HeroProps = {
  step: Step;
  submitting: boolean;
  loadingCompetitors: boolean;
  companyName: string; setCompanyName: (v: string) => void;
  companyUrl: string; setCompanyUrl: (v: string) => void;
  landingPageUrl: string; setLandingPageUrl: (v: string) => void;
  productDescription: string; setProductDescription: (v: string) => void;
  icpDescription: string; setIcpDescription: (v: string) => void;
  notes: string; setNotes: (v: string) => void;
  adContentDescription: string; setAdContentDescription: (v: string) => void;
  showOptional: boolean; setShowOptional: (v: boolean) => void;
  suggestedCompetitors: CompetitorSuggestion[];
  customCompetitor: string; setCustomCompetitor: (v: string) => void;
  apiError: string | null;
  demoMode: boolean;
  cheapMode: boolean;
  onInitialSubmit: (e: React.FormEvent) => void;
  onAddCompetitor: () => void;
  onRemoveCompetitor: (i: number) => void;
  onAnalyze: () => void;
  onBack: () => void;
};

function Hero(props: HeroProps) {
  return (
    <section id="start" className="relative">
      {/* soft decorative blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-40 h-72 w-72 rounded-full bg-blush/60 blur-3xl" />
        <div className="absolute right-[-10%] top-[-10%] h-96 w-96 rounded-full bg-butter/70 blur-3xl" />
      </div>

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 pb-24 pt-16 md:grid-cols-[1.15fr_0.85fr] md:pt-24">
        {/* LEFT */}
        <div className="relative min-w-0">
          <div className="rise rise-1 mb-6 inline-flex items-center gap-2 rounded-full border hairline bg-paper/70 px-3 py-1 text-[0.72rem] font-medium tracking-wide text-ink/70 backdrop-blur">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-coral" />
            Meta ad diagnosis for founder-led SaaS
          </div>

          <h1 className="rise rise-2 display text-[clamp(2.25rem,4.2vw,3.75rem)] leading-[1.05] tracking-[-0.01em] [text-wrap:balance]">
            Stop guessing{" "}
            <span className="display-italic text-coral">why</span>{" "}
            your ads flop.
          </h1>

          <p className="rise rise-3 mt-6 max-w-xl text-lg leading-relaxed text-ink/75">
            Paste your URL. We pull your Meta ads, benchmark your real
            competitors, and hand you a diagnosis plus concepts you can ship
            this week.
          </p>

          {/* FORM SURFACE */}
          <div className="rise rise-4 mt-10">
            {props.step === "input" && (
              <InputStep {...props} />
            )}
            {props.step === "competitors" && (
              <CompetitorsStep {...props} />
            )}
            {props.step === "submitting" && (
              <div className="flex items-center gap-3 rounded-2xl border hairline bg-card px-5 py-4 text-sm text-ink/70">
                <Loader2 className="h-4 w-4 animate-spin text-coral" />
                Starting analysis…
              </div>
            )}
          </div>

          <div className="rise rise-5 mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink/60">
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-sage" /> ~90 sec diagnosis</span>
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-sage" /> No sign-up to start</span>
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-sage" /> Built by a founder</span>
          </div>
        </div>

        {/* RIGHT — product card */}
        <div className="relative hidden md:block">
          <MarkerSticker className="absolute -left-4 -top-4 z-20">
            your brand, extracted live ↘
          </MarkerSticker>
          <div className="float-tilt relative">
            <ProductPreviewCard />
          </div>
          <MarkerSticker className="absolute -bottom-6 right-8 z-20 !bg-blush" rotate={4}>
            concepts, ranked
          </MarkerSticker>
        </div>
      </div>
    </section>
  );
}

function MarkerSticker({
  children,
  className = "",
  rotate = -3,
}: {
  children: React.ReactNode;
  className?: string;
  rotate?: number;
}) {
  return (
    <span
      className={`marker text-sm ${className}`}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      {children}
    </span>
  );
}

/* ─── Form: Step 1 — Input ─── */

function InputStep(p: HeroProps) {
  return (
    <form onSubmit={p.onInitialSubmit} className="rounded-[1.3rem] border hairline bg-card p-4 shadow-[0_1px_0_rgba(26,25,21,0.04),0_12px_30px_-12px_rgba(26,25,21,0.15)]">
      <div className="flex flex-col gap-3 md:flex-row">
        <div className="flex-1">
          <Label htmlFor="companyName" className="eyebrow text-ink/50">Company</Label>
          <Input
            id="companyName"
            placeholder="Tally"
            value={p.companyName}
            onChange={(e) => p.setCompanyName(e.target.value)}
            required
            className="mt-1 h-11 rounded-xl border-hairline bg-paper text-base"
          />
        </div>
        <div className="flex-[1.3]">
          <Label htmlFor="companyUrl" className="eyebrow text-ink/50">Website</Label>
          <Input
            id="companyUrl"
            placeholder="tally.so"
            value={p.companyUrl}
            onChange={(e) => p.setCompanyUrl(e.target.value)}
            required
            className="mt-1 h-11 rounded-xl border-hairline bg-paper text-base"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-col items-stretch gap-3 md:flex-row md:items-center md:justify-between">
        <button
          type="button"
          onClick={() => p.setShowOptional(!p.showOptional)}
          className="text-left text-sm text-ink/60 underline-offset-4 hover:text-ink hover:underline"
        >
          {p.showOptional ? "Hide" : "Add"} context about your product & ads (optional)
        </button>
        <button type="submit" className="btn-chunk justify-center">
          Diagnose my ads
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {p.showOptional && (
        <div className="mt-5 grid gap-4 border-t hairline pt-5">
          <Field label="Landing page URL (if different)">
            <Input
              value={p.landingPageUrl}
              onChange={(e) => p.setLandingPageUrl(e.target.value)}
              placeholder="tally.so/pricing"
              className="h-11 rounded-xl border-hairline bg-paper text-base"
            />
          </Field>
          <Field label="What does the product do?">
            <Textarea
              value={p.productDescription}
              onChange={(e) => p.setProductDescription(e.target.value)}
              rows={3}
              placeholder="Brief description of the product and its core value prop…"
              className="rounded-xl border-hairline bg-paper"
            />
          </Field>
          <Field label="Who is the target customer?">
            <Textarea
              value={p.icpDescription}
              onChange={(e) => p.setIcpDescription(e.target.value)}
              rows={3}
              placeholder="e.g. Startup founders running Meta ads who need help deciding what to test next…"
              className="rounded-xl border-hairline bg-paper"
            />
          </Field>
          <Field
            label="Describe your video ads"
            hint="We can only read captions, not video content. Give us your top hooks/scenes so the analysis hits the real creative."
          >
            <Textarea
              value={p.adContentDescription}
              onChange={(e) => p.setAdContentDescription(e.target.value)}
              rows={4}
              placeholder="e.g. POV videos during interviews. Top hook: 'I used AI to cheat my way into Big Tech.'"
              className="rounded-xl border-hairline bg-paper"
            />
          </Field>
          <Field label="Anything else we should know?">
            <Textarea
              value={p.notes}
              onChange={(e) => p.setNotes(e.target.value)}
              rows={3}
              placeholder="e.g. We're getting clicks but no conversions, CPA rising…"
              className="rounded-xl border-hairline bg-paper"
            />
          </Field>
        </div>
      )}
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="eyebrow text-ink/50">{label}</Label>
      {hint && <p className="text-xs text-ink/55">{hint}</p>}
      {children}
    </div>
  );
}

/* ─── Form: Step 2 — Competitors ─── */

function CompetitorsStep(p: HeroProps) {
  return (
    <div className="rounded-[1.3rem] border hairline bg-card p-5 shadow-[0_1px_0_rgba(26,25,21,0.04),0_12px_30px_-12px_rgba(26,25,21,0.15)]">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h3 className="font-semibold text-xl text-ink">Confirm your competitors</h3>
          <p className="mt-1 text-sm text-ink/60">
            We’ll pull their Meta ads too. Remove any that aren’t relevant, add your own.
          </p>
        </div>
        <button onClick={p.onBack} className="text-sm text-ink/60 underline-offset-4 hover:text-ink hover:underline">
          ← back
        </button>
      </div>

      {p.loadingCompetitors ? (
        <div className="mt-6 flex items-center gap-3 rounded-xl bg-butter/60 px-4 py-3 text-sm text-ink/80">
          <Loader2 className="h-4 w-4 animate-spin text-coral" />
          Analysing {p.companyName} to suggest competitors…
        </div>
      ) : (
        <>
          {p.apiError && (
            <div className="mt-4 rounded-xl border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-ink/80">
              {p.apiError}
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {p.suggestedCompetitors.map((c, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-2 rounded-full border hairline bg-paper px-3 py-1.5 text-sm text-ink"
              >
                {c.name}
                <button
                  onClick={() => p.onRemoveCompetitor(i)}
                  className="grid h-4 w-4 place-items-center rounded-full text-ink/50 hover:bg-ink hover:text-paper"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {p.suggestedCompetitors.length === 0 && (
              <p className="text-sm text-ink/50">No competitors suggested. Add some below.</p>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <Input
              placeholder="Add a competitor…"
              value={p.customCompetitor}
              onChange={(e) => p.setCustomCompetitor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  p.onAddCompetitor();
                }
              }}
              className="h-11 rounded-xl border-hairline bg-paper"
            />
            <button onClick={p.onAddCompetitor} type="button" className="btn-ghost-ink px-4">
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              className="btn-chunk"
              onClick={p.onAnalyze}
              disabled={p.submitting}
            >
              {p.submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Starting…
                </>
              ) : (
                <>
                  {p.demoMode ? "Run demo analysis" : p.cheapMode ? "Run cheap test" : "Run full analysis"}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Product Preview Card ─── */

function ProductPreviewCard() {
  return (
    <div className="relative rounded-[1.6rem] border-[1.5px] border-ink bg-paper p-4 shadow-[10px_14px_0_-2px_var(--ink)]">
      {/* window chrome */}
      <div className="flex items-center gap-1.5 pb-3">
        <span className="h-2.5 w-2.5 rounded-full bg-coral/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-butter" />
        <span className="h-2.5 w-2.5 rounded-full bg-sage/60" />
        <span className="ml-3 font-mono text-[0.7rem] text-ink/50">
          betteryourads.com/analyze/acme
        </span>
      </div>

      <div className="rounded-[1.2rem] border hairline bg-paper p-4">
        {/* Editorial masthead — matches the real /analyze page */}
        <div className="eyebrow text-ink/55">A diagnosis · April 23, 2026</div>
        <h3 className="display mt-2 text-[1.75rem] leading-[1.05]">
          What&apos;s happening with{" "}
          <span className="display-italic text-coral">Acme Labs</span>&apos; ads.
        </h3>

        {/* Pull-quote TL;DR — the real report opens with this */}
        <p className="font-semibold mt-3 text-[0.9rem] leading-snug text-ink/85">
          Running problem-aware creative at a solution-aware audience.
          Missing most-aware entirely for 42 days.
        </p>

        {/* Stats strip — mirrors real StatGrid: Active ads / Comp ads / Competitors / Brand color */}
        <dl className="mt-4 grid grid-cols-4 divide-x divide-hairline border-y hairline">
          <MiniStat value="14" label="Active ads" />
          <MiniStat value="63" label="Rival ads" />
          <MiniStat value="8" label="Competitors" />
          <div className="flex flex-col justify-between gap-1 p-2">
            <span
              className="h-5 w-5 rounded-md border border-ink/15"
              style={{ backgroundColor: "var(--coral)" }}
            />
            <span className="eyebrow text-[0.55rem] text-ink/55">Brand color</span>
          </div>
        </dl>

        {/* Concepts strip — stage badges match the real 5-stage model */}
        <div className="mt-4 flex items-baseline justify-between">
          <div className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-ink/50">
            06 · The plan
          </div>
          <div className="font-mono text-[0.65rem] text-ink/50">12 concepts · ranked</div>
        </div>
        <div className="mt-2 space-y-1.5">
          <ConceptRow
            rank="01"
            stage="Problem"
            title="The spreadsheet confession"
            hook='"I tracked my Meta spend for 90 days…"'
            tone="coral"
          />
          <ConceptRow
            rank="02"
            stage="Solution"
            title="The founder who fired the agency"
            hook='"$6k/mo gone. Here’s what replaced it."'
            tone="sage"
          />
          <ConceptRow
            rank="03"
            stage="Most"
            title="Retarget · 7-day trial, no card"
            hook='"You viewed the pricing 3 times. Here."'
            tone="ink"
          />
        </div>
      </div>
    </div>
  );
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col justify-between gap-1 p-2">
      <div className="font-semibold text-2xl leading-none text-ink">{value}</div>
      <div className="eyebrow text-[0.55rem] text-ink/55">{label}</div>
    </div>
  );
}

function ConceptRow({
  rank,
  stage,
  title,
  hook,
  tone,
}: {
  rank: string;
  stage: string;
  title: string;
  hook: string;
  tone: "coral" | "sage" | "butter" | "blush" | "ink";
}) {
  const toneMap: Record<typeof tone, string> = {
    coral: "bg-coral text-white",
    sage: "bg-sage text-white",
    butter: "bg-butter text-ink",
    blush: "bg-blush text-ink",
    ink: "bg-ink text-paper",
  };
  return (
    <div className="flex items-start gap-2.5 rounded-xl border hairline bg-card px-3 py-2">
      <span className="font-mono mt-0.5 text-[0.6rem] text-ink/45">{rank}</span>
      <span className={`mt-[1px] shrink-0 rounded-full px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-wider ${toneMap[tone]}`}>
        {stage}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[0.78rem] font-medium text-ink">{title}</div>
        <div className="truncate font-mono text-[0.62rem] text-ink/55">{hook}</div>
      </div>
    </div>
  );
}

/* ───────────────────────── Trust strip ───────────────────────── */

function TrustStrip() {
  const words = [
    "Founder-led SaaS",
    "Indie B2C",
    "Seed → Series A",
    "Solo ad buyers",
    "Growth agencies",
    "Scrappy Meta teams",
  ];
  return (
    <section className="relative border-y hairline bg-card py-6">
      <div className="overflow-hidden">
        <div className="font-semibold drift flex min-w-max gap-12 whitespace-nowrap text-2xl text-ink/55">
          {[...words, ...words].map((w, i) => (
            <span key={i} className="flex items-center gap-12">
              {w}
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-coral" />
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── Triptych ───────────────────────── */

function Triptych() {
  const cards = [
    {
      tone: "butter",
      eyebrow: "01",
      title: "A brand breakdown",
      body: "We reverse-engineer your visual identity from your live site — palette, type, voice, do's and don'ts — so every concept looks like *you*, not like an AI guessed.",
      mark: <SwatchesMini />,
    },
    {
      tone: "blush",
      eyebrow: "02",
      title: "The real competitor set",
      body: "We pull active Meta ads from the competitors that actually matter, benchmark them against yours, and surface the angles quietly printing money in your category.",
      mark: <CompetitorMini />,
    },
    {
      tone: "sage",
      eyebrow: "03",
      title: "Concepts you can ship",
      body: "Not a vague report. Ranked concepts, with hooks, scenes, awareness stage, and a test plan — ready to hand to your editor on Monday.",
      mark: <ConceptMini />,
    },
  ] as const;

  return (
    <section id="what" className="mx-auto max-w-6xl px-6 py-24">
      <header className="mb-14 max-w-2xl">
        <div className="eyebrow text-ink/60">What you get</div>
        <h2 className="display mt-4 text-[clamp(2.25rem,4.5vw,4rem)]">
          A diagnosis,{" "}
          <span className="display-italic text-coral">not</span> a dashboard.
        </h2>
      </header>

      <div className="grid gap-5 md:grid-cols-3">
        {cards.map((c) => (
          <article
            key={c.eyebrow}
            className={`group relative flex flex-col justify-between rounded-[1.6rem] border-[1.5px] border-ink p-7 transition-transform hover:-translate-y-1 ${
              c.tone === "butter"
                ? "bg-butter"
                : c.tone === "blush"
                ? "bg-blush"
                : "bg-sage text-paper"
            }`}
            style={{ boxShadow: "6px 8px 0 0 var(--ink)" }}
          >
            <div>
              <div className={`font-mono text-xs tracking-[0.2em] ${c.tone === "sage" ? "text-paper/60" : "text-ink/50"}`}>
                ▸ {c.eyebrow}
              </div>
              <h3 className="font-semibold mt-3 text-[2rem] leading-[1.05]">
                {c.title}
              </h3>
              <p className={`mt-4 text-[0.98rem] leading-relaxed ${c.tone === "sage" ? "text-paper/85" : "text-ink/75"}`}>
                {c.body}
              </p>
            </div>
            <div className="mt-8">{c.mark}</div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SwatchesMini() {
  return (
    <div className="flex items-center gap-2">
      <span className="h-8 w-8 rounded-lg border border-ink bg-ink" />
      <span className="h-8 w-8 rounded-lg border border-ink bg-coral" />
      <span className="h-8 w-8 rounded-lg border border-ink bg-paper" />
      <span className="h-8 w-8 rounded-lg border border-ink bg-[oklch(0.418_0.074_148)]" />
      <span className="ml-2 font-mono text-[0.7rem] text-ink/60">#FF5B3A · #1A1915</span>
    </div>
  );
}
function CompetitorMini() {
  return (
    <div className="flex items-end gap-1.5">
      {[40, 62, 30, 78, 55, 92, 48, 70].map((h, i) => (
        <span
          key={i}
          className={`w-3 rounded-t-md border border-ink ${i === 5 ? "bg-coral" : "bg-paper"}`}
          style={{ height: `${h / 2}px` }}
        />
      ))}
      <span className="ml-2 font-mono text-[0.7rem] text-ink/60">12 competitors</span>
    </div>
  );
}
function ConceptMini() {
  return (
    <div className="flex flex-wrap gap-1.5">
      {["Problem", "Solution", "Product", "Most"].map((s, i) => (
        <span
          key={s}
          className={`rounded-full border-[1.5px] border-paper px-2.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider ${
            i === 0 ? "bg-paper text-ink" : "bg-transparent text-paper"
          }`}
        >
          {s}
        </span>
      ))}
    </div>
  );
}

/* ───────────────────────── How it works ───────────────────────── */

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Paste your URL.",
      body: "That's it. No pixel, no integrations, no onboarding call. Hand us a domain, the work begins.",
    },
    {
      n: "02",
      title: "We raid the Ad Library.",
      body: "Your live ads, your competitors' live ads — scraped, organised, tagged by awareness stage.",
    },
    {
      n: "03",
      title: "A model that reads like a strategist.",
      body: "Not a vibes summary. We diagnose what's working, what isn't, and what the category is telling you.",
    },
    {
      n: "04",
      title: "A test plan, in your tone.",
      body: "Ranked concepts with hooks, scenes, and a weekly cadence — written in your brand voice, not ours.",
    },
  ];

  return (
    <section id="how" className="bg-card py-24">
      <div className="mx-auto max-w-6xl px-6">
        <header className="mb-16 max-w-2xl">
          <div className="eyebrow text-ink/60">How it works</div>
          <h2 className="display mt-4 text-[clamp(2.25rem,4.5vw,4rem)]">
            Ninety seconds from{" "}
            <span className="display-italic text-coral">paste</span>{" "}
            to plan.
          </h2>
        </header>

        <ol className="grid gap-x-10 gap-y-14 md:grid-cols-2">
          {steps.map((s) => (
            <li key={s.n} className="grid grid-cols-[auto_1fr] gap-x-6">
              <span className="chapter-num">{s.n}</span>
              <div className="border-l hairline pl-6">
                <h3 className="font-semibold text-2xl text-ink">
                  {s.title}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-ink/70">
                  {s.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ───────────────────────── Sample peek ───────────────────────── */

function SamplePeek() {
  return (
    <section id="sample" className="relative mx-auto max-w-6xl px-6 py-24">
      <header className="mb-12 max-w-2xl">
        <div className="eyebrow text-ink/60">A peek inside</div>
        <h2 className="display mt-4 text-[clamp(2.25rem,4.5vw,4rem)]">
          One real page, not{" "}
          <span className="display-italic text-coral">a mock-up</span>.
        </h2>
        <p className="mt-4 text-lg text-ink/70">
          This is what lands in your inbox. Brand, benchmark, diagnosis, concepts — the whole map.
        </p>
      </header>

      <div className="relative">
        <div className="relative overflow-hidden rounded-[1.6rem] border-[1.5px] border-ink bg-paper" style={{ boxShadow: "10px 14px 0 0 var(--ink)" }}>
          {/* Editorial masthead — matches /analyze page exactly */}
          <div className="border-b hairline px-6 pt-10 pb-8 md:px-10 md:pt-14">
            <div className="eyebrow text-ink/55">A diagnosis · April 23, 2026</div>
            <h3 className="display mt-4 max-w-3xl text-[clamp(2rem,4vw,3.25rem)] leading-[1.05]">
              What&apos;s happening with{" "}
              <span className="display-italic text-coral">Acme Labs</span>&apos; ads.
            </h3>
            <p className="mt-5 max-w-2xl text-[0.95rem] leading-relaxed text-ink/70">
              We pulled every active Meta ad from Acme Labs and 8 rivals, cross-referenced Voice-of-Customer from Reddit and G2, and mapped the gaps.
            </p>
          </div>

          {/* Stats strip — mirrors the real StatGrid */}
          <dl className="grid grid-cols-2 divide-x divide-y divide-hairline border-b hairline md:grid-cols-4 md:divide-y-0">
            <SampleStat value="14" label="Active ads" sub="9 video · 5 image" />
            <SampleStat value="63" label="Competitor ads" />
            <SampleStat value="8" label="Competitors" />
            <div className="flex flex-col justify-between gap-3 p-6">
              <div className="flex items-baseline gap-3">
                <span
                  className="h-9 w-9 rounded-md border border-ink/15"
                  style={{ backgroundColor: "var(--coral)" }}
                />
                <span className="font-mono text-sm text-ink">#FF5B3A</span>
              </div>
              <span className="eyebrow text-ink/55">Brand color</span>
            </div>
          </dl>

          <div className="px-6 py-10 md:px-10 md:py-14">
            {/* Executive-summary pull quote — real report opens Diagnosis like this */}
            <div className="relative max-w-3xl">
              <span className="font-semibold pointer-events-none absolute -left-2 -top-8 text-7xl leading-none text-coral/60 md:-left-6 md:text-8xl">“</span>
              <p className="font-semibold text-[clamp(1.25rem,2.2vw,1.8rem)] leading-[1.3] text-ink">
                You’re running problem-aware creative at a solution-aware audience. Your rivals are eating the retargeting pool because you haven&apos;t shipped a single most-aware concept in 42 days.
              </p>
            </div>

            {/* Working / Not-working ledger — matches real DiagnosisSection */}
            <div className="mt-12 grid grid-cols-1 gap-10 border-t hairline pt-10 md:grid-cols-2 md:gap-16">
              <div>
                <div className="eyebrow text-ink/60">What&apos;s working</div>
                <ul className="mt-4 space-y-4 text-[0.95rem] leading-relaxed text-ink/85">
                  <li className="grid grid-cols-[auto_1fr] gap-3">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-sage" />
                    <span><strong>Founder-POV hooks.</strong> Out-CTR static 3.2× across your last 6 creatives.</span>
                  </li>
                  <li className="grid grid-cols-[auto_1fr] gap-3">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-sage" />
                    <span><strong>Testimonial carousels.</strong> Saved your CPA in March — keep running.</span>
                  </li>
                  <li className="grid grid-cols-[auto_1fr] gap-3">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-sage" />
                    <span><strong>Palette translates.</strong> Coral + ink holds up in short-form video.</span>
                  </li>
                </ul>
              </div>
              <div>
                <div className="eyebrow text-ink/60">What&apos;s not</div>
                <ul className="mt-4 space-y-4 text-[0.95rem] leading-relaxed text-ink/85">
                  <li className="grid grid-cols-[auto_1fr] gap-3">
                    <X className="mt-0.5 h-4 w-4 shrink-0 text-coral" />
                    <span><strong>No stage segmentation.</strong> Every ad reads problem-aware.</span>
                  </li>
                  <li className="grid grid-cols-[auto_1fr] gap-3">
                    <X className="mt-0.5 h-4 w-4 shrink-0 text-coral" />
                    <span><strong>Landing mismatch.</strong> CTA promises demo, page shows pricing.</span>
                  </li>
                  <li className="grid grid-cols-[auto_1fr] gap-3">
                    <X className="mt-0.5 h-4 w-4 shrink-0 text-coral" />
                    <span><strong>Retargeting blank.</strong> Zero creative for cart-abandoners.</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Voice of Customer teaser — real report cites snippets with sources */}
            <div className="mt-14 border-t hairline pt-10">
              <div className="eyebrow text-ink/60">Voice of Customer · pulled from 24 snippets</div>
              <figure className="mt-5 max-w-3xl">
                <blockquote className="font-serif text-[1.25rem] italic leading-snug text-ink md:text-[1.5rem]">
                  “I don’t need another dashboard. I need someone to tell me which ad to kill.”
                </blockquote>
                <figcaption className="mt-3 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-ink/55">
                  r/SaaS · 47 upvotes · 2 weeks ago
                </figcaption>
              </figure>
            </div>
          </div>

          {/* Concepts preview — matches real ConceptCards (stage + hook + priority) */}
          <div className="relative border-t hairline bg-card px-6 py-10 md:px-10 md:py-14">
            <div className="flex items-baseline justify-between">
              <div className="eyebrow text-ink/60">The plan · 12 concepts, ranked</div>
              <div className="font-mono text-[0.7rem] text-ink/45">06</div>
            </div>
            <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
              <SampleConcept
                rank="01" stage="Problem" tone="coral"
                title="The spreadsheet confession"
                hook='"I tracked my Meta spend for 90 days and this is what killed it."'
                scene="Founder, messy desk, scrolling Airtable on phone. Hard cut to hook line."
              />
              <SampleConcept
                rank="02" stage="Solution" tone="sage"
                title="The founder who fired the agency"
                hook='"$6k/month gone. Here’s what replaced it."'
                scene="Screen-record of a paused agency invoice, cut to Acme dashboard."
              />
              <SampleConcept
                rank="03" stage="Most" tone="ink"
                title="Retarget · 7-day trial, no card"
                hook='"You viewed our pricing 3 times. So. Just take it."'
                scene="Direct-camera address. White background. One on-screen caption."
              />
              <SampleConcept
                rank="04" stage="Product" tone="butter"
                title="60-sec teardown, live"
                hook='"Most ads flop for the same 3 reasons. Watch."'
                scene="Voice-over screen-share, three cursor annotations."
              />
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent via-card/70 to-card" />
            <div className="relative mt-10 flex justify-center">
              <a href="#start" className="btn-chunk">
                See your own diagnosis
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>

        <MarkerSticker className="absolute -top-4 left-8 z-10" rotate={-5}>
          real report, redacted
        </MarkerSticker>
      </div>
    </section>
  );
}

function SampleStat({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="flex flex-col justify-between gap-3 p-6">
      <div className="font-semibold text-5xl leading-none text-ink md:text-6xl">{value}</div>
      <div>
        <div className="eyebrow text-ink/55">{label}</div>
        {sub && <div className="mt-1 font-mono text-[0.7rem] text-ink/45">{sub}</div>}
      </div>
    </div>
  );
}

function SampleConcept({
  rank,
  stage,
  tone,
  title,
  hook,
  scene,
}: {
  rank: string;
  stage: string;
  tone: "coral" | "sage" | "butter" | "blush" | "ink";
  title: string;
  hook: string;
  scene: string;
}) {
  const toneMap: Record<typeof tone, string> = {
    coral: "bg-coral text-white",
    sage: "bg-sage text-white",
    butter: "bg-butter text-ink",
    blush: "bg-blush text-ink",
    ink: "bg-ink text-paper",
  };
  return (
    <article className="flex flex-col gap-3 rounded-[1.2rem] border-[1.5px] border-ink bg-paper p-5">
      <div className="flex items-center justify-between">
        <span className={`rounded-full px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-wider ${toneMap[tone]}`}>
          {stage}
        </span>
        <span className="font-mono text-[0.65rem] text-ink/45">#{rank}</span>
      </div>
      <h4 className="font-semibold text-[1.05rem] leading-tight text-ink">{title}</h4>
      <p className="font-serif text-[0.92rem] italic leading-snug text-ink/80">{hook}</p>
      <p className="mt-auto text-[0.8rem] leading-relaxed text-ink/60">
        <span className="eyebrow text-ink/50">Scene · </span>
        {scene}
      </p>
    </article>
  );
}

/* ───────────────────────── Founder note ───────────────────────── */

function FounderNote() {
  return (
    <section id="founder" className="relative py-24">
      <div className="mx-auto max-w-3xl px-6">
        <div className="relative border-l-[3px] border-coral pl-6 md:pl-10">
          <div className="eyebrow text-ink/60">A note from Lucent</div>
          <blockquote className="font-semibold mt-5 text-[clamp(1.6rem,3vw,2.3rem)] leading-[1.2] text-ink">
            If your ads aren’t working, you get two options. Run them yourself
            — a full-time job on top of the one you already have. Or pay an
            agency $3–10k a month <em>on top of</em> spend and hope it works.
            So I built the thing I wished existed.
          </blockquote>
          <div className="mt-6 flex items-center gap-3">
            <div className="font-semibold flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-ink bg-butter text-lg">
              L
            </div>
            <div>
              <div className="font-medium text-ink">Lucent Wu</div>
              <div className="font-mono text-xs text-ink/55">
                founder · betteryourads
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── Final CTA ───────────────────────── */

function FinalCta({ onScrollTop }: { onScrollTop: () => void }) {
  return (
    <section className="relative overflow-hidden bg-ink text-paper">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.08] paper-grain" />
      <div className="relative mx-auto max-w-6xl px-6 py-24 md:py-32">
        <div className="grid items-end gap-10 md:grid-cols-[1.3fr_0.7fr]">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.22em] text-paper/50">
              ready?
            </div>
            <h2 className="display mt-5 text-[clamp(2.6rem,6vw,5.5rem)]">
              Find out <span className="display-italic text-coral">why</span>
              <br />
              your ads flop.
            </h2>
          </div>
          <div className="flex flex-col items-start gap-4 md:items-end">
            <button onClick={onScrollTop} className="btn-chunk">
              Diagnose my ads
              <ArrowUpRight className="h-4 w-4" />
            </button>
            <span className="font-mono text-xs text-paper/50">
              ~90 sec · no credit card · founder-built
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── Footer ───────────────────────── */

function Footer() {
  return (
    <footer className="border-t hairline bg-paper py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-6 md:flex-row md:items-center">
        <Wordmark />
        <div className="flex items-center gap-6 font-mono text-xs text-ink/55">
          <span>© {new Date().getFullYear()} betteryourads</span>
          <a href="mailto:hi@betteryourads.com" className="link-underline">hi@betteryourads.com</a>
        </div>
      </div>
    </footer>
  );
}
