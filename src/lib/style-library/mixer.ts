/**
 * Mixer — combines curated, competitor, and (future) user-uploaded cards
 * into a shuffled deck for the style quiz. Output is at most 20 cards so
 * the swipe stays under a minute of attention.
 */
import { loadCuratedCards } from "./curated-loader";
import { loadCompetitorCards } from "./competitor-loader";

export interface DeckCard {
  key: string;
  imageUrl: string;
  source: "curated" | "competitor" | "uploaded";
  brand?: string;
  competitor?: string;
  copyText?: string;
}

function shuffle<T>(arr: T[], seed: number): T[] {
  // Mulberry32 — deterministic per session if we want the same deck on retry.
  let s = seed >>> 0;
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    const j = Math.floor(r * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

interface BuildDeckOpts {
  brandId?: string;
  /** Cap on total cards in the deck. */
  limit?: number;
  /** RNG seed for shuffle — defaults to wall-clock so each session differs. */
  seed?: number;
}

export async function buildDeck(opts: BuildDeckOpts): Promise<DeckCard[]> {
  const limit = opts.limit ?? 18;

  const [curated, competitors] = await Promise.all([
    loadCuratedCards(),
    opts.brandId ? loadCompetitorCards(opts.brandId, 24) : Promise.resolve([]),
  ]);

  const curatedCards: DeckCard[] = curated.map((c) => ({
    key: c.key,
    imageUrl: c.imageUrl,
    source: "curated",
    brand: c.brand,
  }));

  const competitorCards: DeckCard[] = competitors.map((c) => ({
    key: c.key,
    imageUrl: c.imageUrl,
    source: "competitor",
    competitor: c.competitor,
    copyText: c.copyText,
  }));

  // Aim for ~60% curated / 40% competitor mix when both are available.
  // If the user has no competitors scraped yet (skipped FB verification or
  // the scrape returned nothing), the deck falls back to all curated.
  const wantCompetitor = Math.min(competitorCards.length, Math.round(limit * 0.4));
  const wantCurated = limit - wantCompetitor;

  const seed = opts.seed ?? Date.now();
  const pickedCurated = shuffle(curatedCards, seed).slice(0, wantCurated);
  const pickedCompetitor = shuffle(competitorCards, seed + 1).slice(
    0,
    wantCompetitor,
  );

  return shuffle([...pickedCurated, ...pickedCompetitor], seed + 2);
}
