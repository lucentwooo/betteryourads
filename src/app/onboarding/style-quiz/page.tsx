"use client";

/**
 * Onboarding step 4 — Style quiz.
 *
 * Loads a mixed deck (curated + competitor ads), lets the user love-or-skip,
 * then sends the loved set off to the breakdown engine. Once breakdowns are
 * saved, redirects back to ?next= (the analyze page they came from) or
 * /dashboard.
 */
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { StyleQuiz, type QuizCard } from "@/components/StyleQuiz";

interface DeckResponse {
  cards: QuizCard[];
  error?: string;
}

function StyleQuizPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";

  const [cards, setCards] = useState<QuizCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/style-references/deck");
        const data = (await res.json()) as DeckResponse;
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || "Couldn't load the deck");
        setCards(data.cards || []);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleComplete(loved: QuizCard[]) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/style-references/breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lovedCards: loved,
          originUrl: window.location.origin,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      if (data.saved === 0) {
        throw new Error(
          "We couldn't break down any of those references — try a different selection.",
        );
      }
      router.push(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <a
          href="/"
          className="inline-flex w-fit items-baseline gap-[2px] font-serif text-[1.2rem] leading-none"
        >
          <span className="italic">better</span>
          <span className="text-coral italic">your</span>
          <span className="italic">ads</span>
          <span className="ml-1 inline-block h-1.5 w-1.5 translate-y-[-2px] rounded-full bg-coral" />
        </a>

        <div className="mt-12">
          <div className="eyebrow text-ink/55">Onboarding · 04</div>
          <h1 className="display mt-3 text-4xl leading-[1.05]">
            Pick the ads that <span className="display-italic text-coral">feel like you</span>.
          </h1>
          <p className="mt-3 max-w-xl text-ink/70">
            Love the ones that match the vibe you want. Skip the rest. We&apos;ll learn the
            structural DNA — palette, composition, typography — and bake it into every
            future creative.
          </p>
        </div>

        <div className="mt-10">
          {error && (
            <div className="mb-4 rounded-xl border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-ink/80">
              {error}
            </div>
          )}

          {cards === null && !error && (
            <div className="flex items-center gap-3 rounded-2xl border hairline bg-card px-5 py-4 text-sm text-ink/70">
              <Loader2 className="h-4 w-4 animate-spin text-coral" />
              Loading the deck…
            </div>
          )}

          {cards !== null && cards.length === 0 && (
            <div className="rounded-2xl border hairline bg-card p-5 text-sm text-ink/70">
              The deck came back empty. That usually means the curated library
              didn&apos;t load — try refreshing.
            </div>
          )}

          {cards !== null && cards.length > 0 && (
            <StyleQuiz cards={cards} onComplete={handleComplete} submitting={submitting} />
          )}
        </div>
      </div>
    </main>
  );
}

export default function StyleQuizPage() {
  return (
    <Suspense fallback={null}>
      <StyleQuizPageInner />
    </Suspense>
  );
}
