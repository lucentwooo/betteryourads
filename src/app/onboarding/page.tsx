"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ExternalLink, Loader2, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Step = "business" | "facebook" | "competitors" | "submitting";
type BusinessType = "saas-b2b" | "saas-b2c" | "dtc" | "service" | "other";

interface CompetitorSuggestion {
  name: string;
  searchTerm: string;
}

interface FbCandidate {
  pageId: string;
  pageName: string;
  matchScore: number;
  sampleAdCount: number;
  pageUrl: string;
}

const BUSINESS_TYPES: { value: BusinessType; label: string }[] = [
  { value: "saas-b2b", label: "SaaS · B2B" },
  { value: "saas-b2c", label: "SaaS · B2C" },
  { value: "dtc", label: "DTC / e-commerce" },
  { value: "service", label: "Service / agency" },
  { value: "other", label: "Other" },
];

const STEP_LABELS = ["Your business", "Facebook page", "Competitors", "Diagnose"];

export default function OnboardingPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("business");
  const [companyName, setCompanyName] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType>("saas-b2b");
  const [productDescription, setProductDescription] = useState("");
  const [icpDescription, setIcpDescription] = useState("");
  const [showOptional, setShowOptional] = useState(false);

  // Facebook page verification
  const [fbCandidates, setFbCandidates] = useState<FbCandidate[]>([]);
  const [fbReason, setFbReason] = useState<string | null>(null);
  const [loadingFb, setLoadingFb] = useState(false);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [savingFb, setSavingFb] = useState(false);
  const [manualPageId, setManualPageId] = useState("");

  const [suggestedCompetitors, setSuggestedCompetitors] = useState<CompetitorSuggestion[]>([]);
  const [customCompetitor, setCustomCompetitor] = useState("");
  const [loadingCompetitors, setLoadingCompetitors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBusinessSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyName || !companyUrl) return;
    setStep("facebook");
    setLoadingFb(true);
    setError(null);
    setFbCandidates([]);
    setFbReason(null);
    try {
      const res = await fetch("/api/brand/facebook-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, companyUrl }),
      });
      const data = await res.json();
      setFbCandidates(data.candidates || []);
      setFbReason(data.reason || null);
      // Pre-select the highest-confidence match if there's a clear winner.
      const top = (data.candidates || [])[0];
      if (top && top.matchScore >= 70) {
        setSelectedPageId(top.pageId);
      }
    } catch (err) {
      setFbReason(err instanceof Error ? err.message : "Couldn't search Facebook pages");
    } finally {
      setLoadingFb(false);
    }
  }

  async function handleFacebookSubmit(opts: { skip?: boolean } = {}) {
    setSavingFb(true);
    setError(null);
    try {
      const chosen = opts.skip
        ? null
        : fbCandidates.find((c) => c.pageId === selectedPageId);

      // Always upsert the brand row at this stage so /api/analyze finds it
      // later — even when the user skips FB verification.
      const res = await fetch("/api/brand/save-facebook-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          companyUrl,
          businessType,
          pageId: chosen?.pageId,
          pageName: chosen?.pageName,
          pageUsername: chosen?.pageName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");

      setStep("competitors");
      setLoadingCompetitors(true);
      // Kick off competitor suggestion in parallel with the next render.
      try {
        const sc = await fetch("/api/suggest-competitors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyName, companyUrl }),
        });
        const scData = await sc.json();
        setSuggestedCompetitors(scData.competitors || []);
        if (scData.error) setError(scData.error);
      } catch (err) {
        setSuggestedCompetitors([]);
        setError(err instanceof Error ? err.message : "Couldn't suggest competitors — add some manually");
      } finally {
        setLoadingCompetitors(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingFb(false);
    }
  }

  function handleManualPageId() {
    const trimmed = manualPageId.trim();
    if (!trimmed) return;
    // Accept either a numeric page id or a facebook.com URL containing one.
    const idMatch = trimmed.match(/(\d{6,})/);
    const pageId = idMatch ? idMatch[1] : trimmed;
    setFbCandidates((prev) => [
      ...prev,
      {
        pageId,
        pageName: `${companyName} (manual)`,
        matchScore: 100,
        sampleAdCount: 0,
        pageUrl: `https://www.facebook.com/${pageId}`,
      },
    ]);
    setSelectedPageId(pageId);
    setManualPageId("");
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

        {step === "facebook" && (
          <FacebookStep
            companyName={companyName}
            loading={loadingFb}
            candidates={fbCandidates}
            reason={fbReason}
            selectedPageId={selectedPageId}
            setSelectedPageId={setSelectedPageId}
            manualPageId={manualPageId}
            setManualPageId={setManualPageId}
            onAddManual={handleManualPageId}
            onContinue={() => handleFacebookSubmit()}
            onSkip={() => handleFacebookSubmit({ skip: true })}
            onBack={() => setStep("business")}
            saving={savingFb}
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
            onBack={() => setStep("facebook")}
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
  const idx =
    step === "business" ? 0 :
    step === "facebook" ? 1 :
    step === "competitors" ? 2 : 3;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-ink/55">
      {STEP_LABELS.map((label, i) => (
        <span key={label} className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${i <= idx ? "bg-coral" : "bg-ink/20"}`} />
          <span className={i === idx ? "text-ink" : ""}>{label}</span>
          {i < STEP_LABELS.length - 1 && <span className="mx-1 text-ink/25">·</span>}
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

function FacebookStep(p: {
  companyName: string;
  loading: boolean;
  candidates: FbCandidate[];
  reason: string | null;
  selectedPageId: string | null;
  setSelectedPageId: (v: string | null) => void;
  manualPageId: string;
  setManualPageId: (v: string) => void;
  onAddManual: () => void;
  onContinue: () => void;
  onSkip: () => void;
  onBack: () => void;
  saving: boolean;
}) {
  return (
    <div className="mt-8">
      <div className="eyebrow text-ink/55">Onboarding · 02</div>
      <h1 className="display mt-3 text-4xl leading-[1.05]">
        Verify your <span className="display-italic text-coral">Facebook page</span>.
      </h1>
      <p className="mt-3 max-w-xl text-ink/70">
        Pick the right page once and every future scrape goes straight to it — no impostors, half the API cost.
      </p>

      <div className="mt-8 rounded-[1.3rem] border hairline bg-card p-5">
        {p.loading ? (
          <div className="flex items-center gap-3 rounded-xl bg-butter/60 px-4 py-3 text-sm text-ink/80">
            <Loader2 className="h-4 w-4 animate-spin text-coral" />
            Searching Meta Ad Library for {p.companyName}…
          </div>
        ) : p.candidates.length === 0 ? (
          <div>
            <p className="text-sm text-ink/70">
              {p.reason ||
                "No Facebook pages found for this brand."}
            </p>
            <p className="mt-3 text-sm text-ink/60">
              Have the FB page id or URL? Paste it below to lock it in. You can find it by visiting your page on facebook.com — the id is the long number in the URL after <code className="font-mono text-ink/85">/people/</code> or <code className="font-mono text-ink/85">/pages/</code>.
            </p>
            <div className="mt-4 flex gap-2">
              <Input
                placeholder="Page id or facebook.com URL"
                value={p.manualPageId}
                onChange={(e) => p.setManualPageId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    p.onAddManual();
                  }
                }}
                className="h-11 rounded-xl border-hairline bg-paper"
              />
              <button onClick={p.onAddManual} type="button" className="btn-ghost-ink px-4">
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-ink/60">
              Found {p.candidates.length} Facebook page{p.candidates.length === 1 ? "" : "s"} that look related. Pick the one that&apos;s actually yours.
            </p>
            <ul className="mt-4 space-y-2">
              {p.candidates.map((c) => {
                const selected = p.selectedPageId === c.pageId;
                return (
                  <li key={c.pageId}>
                    <button
                      type="button"
                      onClick={() => p.setSelectedPageId(c.pageId)}
                      className={`flex w-full items-start justify-between gap-3 rounded-xl border px-4 py-3 text-left transition ${
                        selected
                          ? "border-coral bg-coral/5"
                          : "border-hairline bg-paper hover:border-ink/40"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ink">{c.pageName}</span>
                          {c.matchScore === 100 && (
                            <span className="font-mono rounded-full bg-sage/20 px-2 py-0.5 text-[0.6rem] uppercase tracking-wider text-sage">
                              exact
                            </span>
                          )}
                          {c.matchScore >= 70 && c.matchScore < 100 && (
                            <span className="font-mono rounded-full bg-butter/60 px-2 py-0.5 text-[0.6rem] uppercase tracking-wider text-ink">
                              strong
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 font-mono text-[0.7rem] text-ink/55">
                          page id {c.pageId} · {c.sampleAdCount} ad{c.sampleAdCount === 1 ? "" : "s"} in our sample
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <a
                          href={c.pageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-xs text-ink/55 underline-offset-4 hover:text-ink hover:underline"
                        >
                          view <ExternalLink className="h-3 w-3" />
                        </a>
                        <span
                          className={`grid h-5 w-5 place-items-center rounded-full border ${
                            selected ? "border-coral bg-coral text-paper" : "border-ink/25"
                          }`}
                        >
                          {selected && <Check className="h-3 w-3" />}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            <details className="mt-5 text-sm text-ink/60">
              <summary className="cursor-pointer underline-offset-4 hover:text-ink hover:underline">
                None of these are right? Paste your page id manually
              </summary>
              <div className="mt-3 flex gap-2">
                <Input
                  placeholder="Page id or facebook.com URL"
                  value={p.manualPageId}
                  onChange={(e) => p.setManualPageId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      p.onAddManual();
                    }
                  }}
                  className="h-11 rounded-xl border-hairline bg-paper"
                />
                <button onClick={p.onAddManual} type="button" className="btn-ghost-ink px-4">
                  <Plus className="h-4 w-4" /> Add
                </button>
              </div>
            </details>
          </>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button onClick={p.onBack} className="text-sm text-ink/60 underline-offset-4 hover:text-ink hover:underline">
          ← back
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={p.onSkip}
            disabled={p.saving}
            className="text-sm text-ink/60 underline-offset-4 hover:text-ink hover:underline"
          >
            Skip — I&apos;ll set this later
          </button>
          <button
            onClick={p.onContinue}
            disabled={p.saving || !p.selectedPageId}
            className="btn-chunk"
          >
            {p.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Use this page <ArrowRight className="h-4 w-4" /></>}
          </button>
        </div>
      </div>
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
      <div className="eyebrow text-ink/55">Onboarding · 03</div>
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
