"use client";

/**
 * StyleQuiz — a love/skip swipe deck. Shows the user one ad at a time,
 * captures the ones they "love", and reports them to the parent when the
 * deck runs out (or when they hit 5+ loves and tap Done).
 *
 * Why button-based (not gesture-based): mobile gesture libraries add
 * weight + edge cases (drag jitter, tap-vs-swipe ambiguity). Two big
 * buttons + keyboard arrows is faster, more accurate, and ships today.
 */
import { useEffect, useState } from "react";
import Image from "next/image";
import { Heart, X, Check } from "lucide-react";

export interface QuizCard {
  key: string;
  imageUrl: string;
  source: "curated" | "competitor" | "uploaded";
  brand?: string;
  competitor?: string;
}

interface StyleQuizProps {
  cards: QuizCard[];
  /** Minimum loves required before the user can submit. */
  minLoved?: number;
  /** Maximum loves before we auto-stop and submit. */
  maxLoved?: number;
  onComplete: (loved: QuizCard[]) => void | Promise<void>;
  submitting?: boolean;
}

export function StyleQuiz({
  cards,
  minLoved = 3,
  maxLoved = 7,
  onComplete,
  submitting = false,
}: StyleQuizProps) {
  const [index, setIndex] = useState(0);
  const [loved, setLoved] = useState<QuizCard[]>([]);
  const current = cards[index];
  const remaining = cards.length - index;

  function decide(love: boolean) {
    if (!current || submitting) return;
    const next = love ? [...loved, current] : loved;
    setLoved(next);
    setIndex(index + 1);
    if (love && next.length >= maxLoved) {
      onComplete(next);
    }
  }

  function done() {
    if (loved.length >= minLoved) onComplete(loved);
  }

  useEffect(() => {
    if (!current && loved.length >= minLoved) {
      onComplete(loved);
    }
    // We intentionally only react to running out of cards — not to the
    // loved set growing — to avoid a double-fire when maxLoved triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") decide(false);
      else if (e.key === "ArrowRight") decide(true);
      else if (e.key === "Enter" && loved.length >= minLoved) done();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, loved.length]);

  if (!current) {
    // Out of cards but didn't hit minimum — let user submit anyway with a
    // gentle nudge, or restart. We just show the submit screen.
    return (
      <div className="rounded-[1.3rem] border hairline bg-card p-8 text-center">
        <h3 className="display text-2xl">That&apos;s the deck.</h3>
        <p className="mt-2 text-ink/70">
          You loved {loved.length} ad{loved.length === 1 ? "" : "s"}.
          {loved.length < minLoved &&
            ` We need at least ${minLoved} to learn your style — try the deck again.`}
        </p>
        <button
          onClick={done}
          disabled={loved.length < minLoved || submitting}
          className="btn-chunk mt-6"
        >
          {submitting ? "Saving your style…" : `Save ${loved.length} reference${loved.length === 1 ? "" : "s"}`}
          <Check className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div className="font-mono text-xs uppercase tracking-[0.2em] text-ink/50">
          {loved.length} loved · {remaining} left
        </div>
        {loved.length >= minLoved && (
          <button
            onClick={done}
            disabled={submitting}
            className="text-sm text-ink/70 underline-offset-4 hover:text-ink hover:underline"
          >
            Done — use these {loved.length}
          </button>
        )}
      </div>

      <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-[1.3rem] border hairline bg-paper">
        <Image
          src={current.imageUrl}
          alt={current.brand ?? current.competitor ?? "ad"}
          fill
          sizes="(max-width: 768px) 100vw, 480px"
          className="object-cover"
          unoptimized
          priority
        />
        <div className="absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full bg-paper/90 px-3 py-1 text-[0.65rem] font-mono uppercase tracking-[0.18em] text-ink/70 backdrop-blur">
          {current.source === "curated" && current.brand
            ? current.brand
            : current.source === "competitor" && current.competitor
              ? `rival · ${current.competitor}`
              : current.source}
        </div>
      </div>

      <div className="flex items-center justify-center gap-6">
        <button
          onClick={() => decide(false)}
          disabled={submitting}
          aria-label="Skip"
          className="grid h-16 w-16 place-items-center rounded-full border hairline bg-paper text-ink/70 transition hover:border-ink/40 hover:text-ink"
        >
          <X className="h-7 w-7" />
        </button>
        <button
          onClick={() => decide(true)}
          disabled={submitting}
          aria-label="Love it"
          className="grid h-16 w-16 place-items-center rounded-full bg-coral text-paper transition hover:scale-105"
        >
          <Heart className="h-7 w-7" />
        </button>
      </div>

      <p className="text-center text-xs text-ink/50">
        ← skip · love →
      </p>
    </div>
  );
}
