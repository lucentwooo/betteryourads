"use client";

import { useState } from "react";
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

  async function handleInitialSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyName || !companyUrl) return;
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
      const res = await fetch("/api/analyze", {
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
          competitors: suggestedCompetitors.map((c) => c.name),
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

      <div className="relative mx-auto grid max-w-6xl items-center gap-16 px-6 pb-24 pt-16 md:grid-cols-[1.05fr_0.95fr] md:pt-24">
        {/* LEFT */}
        <div className="relative">
          <div className="rise rise-1 mb-6 inline-flex items-center gap-2 rounded-full border hairline bg-paper/70 px-3 py-1 text-[0.72rem] font-medium tracking-wide text-ink/70 backdrop-blur">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-coral" />
            Meta ad diagnosis for founder-led SaaS
          </div>

          <h1 className="rise rise-2 display text-[clamp(3rem,7vw,6rem)]">
            Stop guessing{" "}
            <span className="display-italic text-coral">why</span>{" "}
            your ads
            <br />
            flop.
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
          <h3 className="font-serif text-xl italic text-ink">Confirm your competitors</h3>
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
                  Run full analysis
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
    <div className="relative rounded-[1.6rem] border-[1.5px] border-ink bg-card p-4 shadow-[10px_14px_0_-2px_var(--ink)]">
      {/* window chrome */}
      <div className="flex items-center gap-1.5 pb-3">
        <span className="h-2.5 w-2.5 rounded-full bg-coral/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-butter" />
        <span className="h-2.5 w-2.5 rounded-full bg-sage/60" />
        <span className="ml-3 font-mono text-[0.7rem] text-ink/50">
          betteryourads.com/analyze/acme
        </span>
      </div>

      <div className="grid grid-cols-5 gap-3 rounded-[1.2rem] border hairline bg-paper p-4">
        {/* Left column — chapter + stats */}
        <div className="col-span-2 space-y-3">
          <div>
            <div className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-ink/50">01 · Brand</div>
            <div className="mt-1 font-serif text-2xl italic leading-tight text-ink">Acme Labs</div>
          </div>

          <div className="rounded-xl border hairline bg-card p-3">
            <div className="eyebrow text-ink/50">Palette</div>
            <div className="mt-2 flex gap-1.5">
              <Swatch color="var(--ink)" />
              <Swatch color="var(--coral)" />
              <Swatch color="var(--butter)" />
              <Swatch color="var(--sage)" />
              <Swatch color="var(--blush)" />
            </div>
          </div>

          <div className="rounded-xl border hairline bg-card p-3">
            <div className="eyebrow text-ink/50">Awareness mix</div>
            <div className="mt-2 flex h-2 overflow-hidden rounded-full">
              <span className="block bg-coral" style={{ width: "42%" }} />
              <span className="block bg-sage" style={{ width: "23%" }} />
              <span className="block bg-butter" style={{ width: "20%" }} />
              <span className="block bg-blush" style={{ width: "15%" }} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 font-mono text-[0.65rem] text-ink/60">
              <span>Problem 42%</span><span>Solution 23%</span>
              <span>Product 20%</span><span>Most 15%</span>
            </div>
          </div>
        </div>

        {/* Right column — concepts list */}
        <div className="col-span-3 space-y-2.5">
          <div className="flex items-baseline justify-between">
            <div className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-ink/50">02 · Concepts</div>
            <div className="font-mono text-[0.65rem] text-ink/50">ranked</div>
          </div>
          <ConceptRow
            stage="Problem"
            title="The spreadsheet confession"
            score={92}
            tone="coral"
          />
          <ConceptRow
            stage="Solution"
            title="A founder who ditched the agency"
            score={88}
            tone="sage"
          />
          <ConceptRow
            stage="Product"
            title="60 sec screen-share teardown"
            score={81}
            tone="butter"
          />
          <ConceptRow
            stage="Most"
            title="Retarget · 7-day trial, no card"
            score={76}
            tone="blush"
          />
          <div className="pt-1 text-right font-mono text-[0.65rem] text-ink/50">
            + 8 more in report ↘
          </div>
        </div>
      </div>
    </div>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      className="h-5 w-5 rounded-md border border-ink/20"
      style={{ background: color }}
    />
  );
}

function ConceptRow({
  stage,
  title,
  score,
  tone,
}: {
  stage: string;
  title: string;
  score: number;
  tone: "coral" | "sage" | "butter" | "blush";
}) {
  const toneMap: Record<typeof tone, string> = {
    coral: "bg-coral text-white",
    sage: "bg-sage text-white",
    butter: "bg-butter text-ink",
    blush: "bg-blush text-ink",
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border hairline bg-card px-3 py-2">
      <span className={`rounded-full px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider ${toneMap[tone]}`}>
        {stage}
      </span>
      <span className="flex-1 truncate text-[0.78rem] text-ink">{title}</span>
      <span className="font-mono text-[0.7rem] text-ink/60">{score}</span>
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
        <div className="drift flex min-w-max gap-12 whitespace-nowrap font-serif text-2xl italic text-ink/55">
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
              <h3 className="mt-3 font-serif text-[2rem] italic leading-[1.05]">
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
                <h3 className="font-serif text-2xl italic text-ink">
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
          <div className="grid grid-cols-12 gap-4 p-6 md:p-10">
            {/* TL;DR */}
            <div className="col-span-12 rounded-[1.2rem] border hairline bg-butter p-6">
              <div className="eyebrow text-ink/60">TL;DR</div>
              <p className="mt-3 font-serif text-2xl italic leading-snug md:text-3xl">
                You’re running problem-aware creative at a solution-aware audience. Your competitors are eating your retargeting pool because you haven’t shipped a single most-aware concept in 42 days.
              </p>
            </div>

            <div className="col-span-12 grid grid-cols-4 gap-3 md:col-span-7">
              {[
                { label: "Live ads", v: "14" },
                { label: "Competitors", v: "08" },
                { label: "Concepts", v: "12" },
                { label: "Missing stages", v: "02" },
              ].map((k) => (
                <div key={k.label} className="rounded-xl border hairline bg-card p-4">
                  <div className="font-serif text-4xl italic text-ink">{k.v}</div>
                  <div className="mt-1 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-ink/50">
                    {k.label}
                  </div>
                </div>
              ))}
              <div className="col-span-4 rounded-xl border hairline bg-card p-4">
                <div className="eyebrow text-ink/50">What's working</div>
                <ul className="mt-3 space-y-2 text-sm text-ink/80">
                  <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-sage" /> Founder-POV hooks out-CTR static 3.2×</li>
                  <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-sage" /> Testimonial carousels saved your CPA last month</li>
                  <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-sage" /> Brand palette translates well to short-form video</li>
                </ul>
              </div>
            </div>

            <div className="col-span-12 rounded-[1.2rem] bg-blush p-6 md:col-span-5">
              <div className="eyebrow text-ink/60">What's not</div>
              <ul className="mt-3 space-y-3 text-[0.95rem] text-ink/85">
                <li>· Every ad reads the same. No stage segmentation.</li>
                <li>· Landing mismatch — CTA promises demo, page shows pricing.</li>
                <li>· No retargeting creative for cart abandoners.</li>
                <li>· You sound like a 2018 SaaS in a 2026 feed.</li>
              </ul>
            </div>
          </div>

          {/* Fade-out gate */}
          <div className="relative">
            <div className="grid grid-cols-12 gap-4 px-6 pb-14 opacity-80 md:px-10">
              <div className="col-span-6 h-32 rounded-xl border hairline bg-card" />
              <div className="col-span-6 h-32 rounded-xl border hairline bg-card" />
              <div className="col-span-4 h-24 rounded-xl border hairline bg-card" />
              <div className="col-span-4 h-24 rounded-xl border hairline bg-card" />
              <div className="col-span-4 h-24 rounded-xl border hairline bg-card" />
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-b from-transparent via-paper/80 to-paper" />
            <div className="absolute inset-x-0 bottom-6 flex justify-center">
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

/* ───────────────────────── Founder note ───────────────────────── */

function FounderNote() {
  return (
    <section id="founder" className="relative py-24">
      <div className="mx-auto max-w-3xl px-6">
        <div className="relative border-l-[3px] border-coral pl-6 md:pl-10">
          <div className="eyebrow text-ink/60">A note from Lucent</div>
          <blockquote className="mt-5 font-serif text-[clamp(1.6rem,3vw,2.3rem)] italic leading-[1.2] text-ink">
            I built this because I got tired of paying growth agencies $8k a
            month to email me PDFs with <em>brand guidelines</em> and zero
            actual creative. You deserve a diagnosis written by someone who’s
            looked at your ads, not a template.
          </blockquote>
          <div className="mt-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-ink bg-butter font-serif text-lg italic">
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
