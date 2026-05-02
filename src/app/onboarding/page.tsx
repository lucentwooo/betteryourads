"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Step = "business" | "competitors" | "submitting";
type BusinessType = "saas-b2b" | "saas-b2c" | "dtc" | "service" | "other";

interface CompetitorSuggestion {
  name: string;
  searchTerm: string;
}

const BUSINESS_TYPES: { value: BusinessType; label: string }[] = [
  { value: "saas-b2b", label: "SaaS · B2B" },
  { value: "saas-b2c", label: "SaaS · B2C" },
  { value: "dtc", label: "DTC / e-commerce" },
  { value: "service", label: "Service / agency" },
  { value: "other", label: "Other" },
];

export default function OnboardingPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("business");
  const [companyName, setCompanyName] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType>("saas-b2b");
  const [productDescription, setProductDescription] = useState("");
  const [icpDescription, setIcpDescription] = useState("");
  const [showOptional, setShowOptional] = useState(false);

  const [suggestedCompetitors, setSuggestedCompetitors] = useState<CompetitorSuggestion[]>([]);
  const [customCompetitor, setCustomCompetitor] = useState("");
  const [loadingCompetitors, setLoadingCompetitors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (step !== "competitors" || suggestedCompetitors.length > 0 || loadingCompetitors) return;
    let cancelled = false;
    (async () => {
      setLoadingCompetitors(true);
      try {
        const res = await fetch("/api/suggest-competitors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyName, companyUrl }),
        });
        const data = await res.json();
        if (!cancelled) setSuggestedCompetitors(data.competitors || []);
      } catch {
        if (!cancelled) setSuggestedCompetitors([]);
      } finally {
        if (!cancelled) setLoadingCompetitors(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, companyName, companyUrl, suggestedCompetitors.length, loadingCompetitors]);

  function handleBusinessSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyName || !companyUrl) return;
    setStep("competitors");
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
    setError(null);
    setStep("submitting");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          companyUrl,
          businessType,
          productDescription: productDescription || undefined,
          icpDescription: icpDescription || undefined,
          competitors: suggestedCompetitors.map((c) => c.name),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to start");
      }
      router.push(`/analyze/${data.jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start");
      setSubmitting(false);
      setStep("competitors");
    }
  }

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <a href="/" className="inline-flex w-fit items-baseline gap-[2px] font-serif text-[1.2rem] leading-none">
          <span className="italic">better</span>
          <span className="text-coral italic">your</span>
          <span className="italic">ads</span>
          <span className="ml-1 inline-block h-1.5 w-1.5 translate-y-[-2px] rounded-full bg-coral" />
        </a>

        <div className="mt-12">
          <ProgressDots step={step} />
        </div>

        {step === "business" && (
          <BusinessStep
            companyName={companyName}
            setCompanyName={setCompanyName}
            companyUrl={companyUrl}
            setCompanyUrl={setCompanyUrl}
            businessType={businessType}
            setBusinessType={setBusinessType}
            productDescription={productDescription}
            setProductDescription={setProductDescription}
            icpDescription={icpDescription}
            setIcpDescription={setIcpDescription}
            showOptional={showOptional}
            setShowOptional={setShowOptional}
            onSubmit={handleBusinessSubmit}
          />
        )}

        {step === "competitors" && (
          <CompetitorsStep
            companyName={companyName}
            loading={loadingCompetitors}
            competitors={suggestedCompetitors}
            customCompetitor={customCompetitor}
            setCustomCompetitor={setCustomCompetitor}
            onAdd={addCompetitor}
            onRemove={removeCompetitor}
            onBack={() => setStep("business")}
            onAnalyze={handleAnalyze}
            submitting={submitting}
          />
        )}

        {step === "submitting" && (
          <div className="mt-8 flex items-center gap-3 rounded-2xl border hairline bg-card px-5 py-4 text-sm text-ink/70">
            <Loader2 className="h-4 w-4 animate-spin text-coral" />
            Starting your diagnosis…
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-ink/80">
            {error}
          </div>
        )}
      </div>
    </main>
  );
}

function ProgressDots({ step }: { step: Step }) {
  const idx = step === "business" ? 0 : step === "competitors" ? 1 : 2;
  return (
    <div className="flex items-center gap-2 text-sm text-ink/55">
      {["Your business", "Competitors", "Diagnose"].map((label, i) => (
        <span key={label} className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${i <= idx ? "bg-coral" : "bg-ink/20"}`} />
          <span className={i === idx ? "text-ink" : ""}>{label}</span>
          {i < 2 && <span className="mx-1 text-ink/25">·</span>}
        </span>
      ))}
    </div>
  );
}

function BusinessStep(p: {
  companyName: string;
  setCompanyName: (v: string) => void;
  companyUrl: string;
  setCompanyUrl: (v: string) => void;
  businessType: BusinessType;
  setBusinessType: (v: BusinessType) => void;
  productDescription: string;
  setProductDescription: (v: string) => void;
  icpDescription: string;
  setIcpDescription: (v: string) => void;
  showOptional: boolean;
  setShowOptional: (v: boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <div className="mt-8">
      <div className="eyebrow text-ink/55">Onboarding · 01</div>
      <h1 className="display mt-3 text-4xl leading-[1.05]">
        Tell us about <span className="display-italic text-coral">your business</span>.
      </h1>
      <p className="mt-3 text-ink/70">
        We&apos;ll learn your brand once. After this you never re-enter it again.
      </p>

      <form onSubmit={p.onSubmit} className="mt-8 rounded-[1.3rem] border hairline bg-card p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="companyName" className="eyebrow text-ink/50">Company</Label>
            <Input
              id="companyName"
              required
              placeholder="Tally"
              value={p.companyName}
              onChange={(e) => p.setCompanyName(e.target.value)}
              className="mt-1 h-11 rounded-xl border-hairline bg-paper text-base"
            />
          </div>
          <div>
            <Label htmlFor="companyUrl" className="eyebrow text-ink/50">Website</Label>
            <Input
              id="companyUrl"
              required
              placeholder="tally.so"
              value={p.companyUrl}
              onChange={(e) => p.setCompanyUrl(e.target.value)}
              className="mt-1 h-11 rounded-xl border-hairline bg-paper text-base"
            />
          </div>
        </div>

        <div className="mt-5">
          <Label className="eyebrow text-ink/50">Business type</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {BUSINESS_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => p.setBusinessType(t.value)}
                className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
                  p.businessType === t.value
                    ? "border-ink bg-ink text-paper"
                    : "border-hairline bg-paper text-ink/75 hover:border-ink/40"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => p.setShowOptional(!p.showOptional)}
            className="text-sm text-ink/60 underline-offset-4 hover:text-ink hover:underline"
          >
            {p.showOptional ? "Hide" : "Add"} product context (optional)
          </button>
          <button type="submit" className="btn-chunk">
            Next <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {p.showOptional && (
          <div className="mt-5 grid gap-4 border-t hairline pt-5">
            <div>
              <Label className="eyebrow text-ink/50">What does your product do?</Label>
              <Textarea
                rows={3}
                value={p.productDescription}
                onChange={(e) => p.setProductDescription(e.target.value)}
                className="mt-1 rounded-xl border-hairline bg-paper"
                placeholder="The core value prop in a sentence or two…"
              />
            </div>
            <div>
              <Label className="eyebrow text-ink/50">Who&apos;s your target customer?</Label>
              <Textarea
                rows={3}
                value={p.icpDescription}
                onChange={(e) => p.setIcpDescription(e.target.value)}
                className="mt-1 rounded-xl border-hairline bg-paper"
                placeholder="e.g. Founders at seed-stage SaaS, running Meta ads themselves…"
              />
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

function CompetitorsStep(p: {
  companyName: string;
  loading: boolean;
  competitors: CompetitorSuggestion[];
  customCompetitor: string;
  setCustomCompetitor: (v: string) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  onBack: () => void;
  onAnalyze: () => void;
  submitting: boolean;
}) {
  return (
    <div className="mt-8">
      <div className="eyebrow text-ink/55">Onboarding · 02</div>
      <h1 className="display mt-3 text-4xl leading-[1.05]">
        Confirm your <span className="display-italic text-coral">competitors</span>.
      </h1>
      <p className="mt-3 text-ink/70">
        We&apos;ll pull their Meta ads alongside yours. Remove any that don&apos;t fit. Add the ones we missed.
      </p>

      <div className="mt-8 rounded-[1.3rem] border hairline bg-card p-5">
        {p.loading ? (
          <div className="flex items-center gap-3 rounded-xl bg-butter/60 px-4 py-3 text-sm text-ink/80">
            <Loader2 className="h-4 w-4 animate-spin text-coral" />
            Analysing {p.companyName} to suggest competitors…
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {p.competitors.map((c, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-2 rounded-full border hairline bg-paper px-3 py-1.5 text-sm text-ink"
                >
                  {c.name}
                  <button
                    onClick={() => p.onRemove(i)}
                    className="grid h-4 w-4 place-items-center rounded-full text-ink/50 hover:bg-ink hover:text-paper"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {p.competitors.length === 0 && (
                <p className="text-sm text-ink/50">No competitors yet. Add some below.</p>
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
                    p.onAdd();
                  }
                }}
                className="h-11 rounded-xl border-hairline bg-paper"
              />
              <button onClick={p.onAdd} type="button" className="btn-ghost-ink px-4">
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
          </>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button onClick={p.onBack} className="text-sm text-ink/60 underline-offset-4 hover:text-ink hover:underline">
          ← back
        </button>
        <button onClick={p.onAnalyze} disabled={p.submitting || p.loading} className="btn-chunk">
          {p.submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Run my diagnosis <ArrowRight className="h-4 w-4" /></>}
        </button>
      </div>

      <ul className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink/60">
        <li className="flex items-center gap-1.5"><Check className="h-4 w-4 text-sage" /> ~90 second diagnosis</li>
        <li className="flex items-center gap-1.5"><Check className="h-4 w-4 text-sage" /> Saved to your account permanently</li>
      </ul>
    </div>
  );
}
