/**
 * Curated style library — reads the existing reference ad-library on disk
 * (src/lib/references/ad-library/{brand}/{ad}.jpg) and returns deck cards
 * for the style quiz.
 *
 * Why we reuse src/lib/references/ad-library:
 *   - Already shipped with the repo and bundled into the Vercel deployment
 *   - Lucent has already curated AG1, Notion, Airbnb, Shopify, Duolingo,
 *     Granola, Kalshi here — no need to duplicate
 *
 * The .jpg files aren't statically served at /, so we expose them via the
 * /api/style-references/curated/{brand}/{file} route which streams from disk.
 */
import fs from "fs/promises";
import path from "path";

export interface CuratedCard {
  /** "ag1/ag1-ad-1" */
  key: string;
  brand: string;
  file: string;
  /** Browser-fetchable URL — served by our API route. */
  imageUrl: string;
}

const LIB_ROOT = path.join(process.cwd(), "src/lib/references/ad-library");

let CACHE: CuratedCard[] | null = null;

export async function loadCuratedCards(): Promise<CuratedCard[]> {
  if (CACHE) return CACHE;

  const cards: CuratedCard[] = [];
  let brandDirs: string[];
  try {
    brandDirs = (await fs.readdir(LIB_ROOT, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
      .map((d) => d.name);
  } catch {
    CACHE = [];
    return CACHE;
  }

  for (const brand of brandDirs) {
    const brandDir = path.join(LIB_ROOT, brand);
    const files = await fs.readdir(brandDir);
    const jpgs = files.filter((f) => f.toLowerCase().endsWith(".jpg"));
    for (const f of jpgs) {
      cards.push({
        key: `${brand}/${path.basename(f, path.extname(f))}`,
        brand,
        file: f,
        imageUrl: `/api/style-references/curated/${encodeURIComponent(brand)}/${encodeURIComponent(f)}`,
      });
    }
  }

  CACHE = cards;
  return cards;
}

/** Resolve a curated card key/file to its absolute path on disk. */
export async function resolveCuratedFile(
  brand: string,
  file: string,
): Promise<string | null> {
  // Defence in depth — never let a request escape the lib root.
  const safeBrand = path.basename(brand);
  const safeFile = path.basename(file);
  const full = path.join(LIB_ROOT, safeBrand, safeFile);
  if (!full.startsWith(LIB_ROOT)) return null;
  try {
    await fs.access(full);
    return full;
  } catch {
    return null;
  }
}
