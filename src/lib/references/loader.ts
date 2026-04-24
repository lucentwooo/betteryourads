import fs from "fs/promises";
import path from "path";

/**
 * In-memory index of reference ads keyed by (register, awareness_stage, brand).
 * Built once at first use — PRD Section 6 Layer 2.
 */

export interface ReferenceAd {
  key: string; // e.g. "notion/notion-ad-1"
  brand: string;
  adId: string;
  awarenessStage: string; // normalized "problem" | "solution" | "product" | "most" | "unaware"
  register: string;
  analysisMd: string;
  promptJson: Record<string, unknown>;
  jpgPath: string; // absolute path on disk
}

let CACHE: ReferenceAd[] | null = null;

const LIB_ROOT = path.join(process.cwd(), "src/lib/references/ad-library");

function normalizeStage(s: string): string {
  const lower = (s || "").toLowerCase();
  if (lower.includes("problem")) return "problem";
  if (lower.includes("solution")) return "solution";
  if (lower.includes("product")) return "product";
  if (lower.includes("most")) return "most";
  if (lower.includes("unaware")) return "unaware";
  return "problem";
}

export async function loadReferenceLibrary(): Promise<ReferenceAd[]> {
  if (CACHE) return CACHE;

  const entries: ReferenceAd[] = [];
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
    let files: string[];
    try {
      files = await fs.readdir(brandDir);
    } catch {
      continue;
    }
    const promptFiles = files.filter((f) => f.endsWith(".prompt.json"));
    for (const promptFile of promptFiles) {
      const adId = promptFile.replace(/\.prompt\.json$/, "");
      try {
        const raw = await fs.readFile(path.join(brandDir, promptFile), "utf-8");
        const json = JSON.parse(raw) as Record<string, unknown>;
        const analysisPath = path.join(brandDir, `${adId}.md`);
        let analysisMd = "";
        try {
          analysisMd = await fs.readFile(analysisPath, "utf-8");
        } catch {
          /* optional */
        }
        entries.push({
          key: `${brand}/${adId}`,
          brand,
          adId,
          awarenessStage: normalizeStage((json.awareness_stage as string) || ""),
          register: String(json.register || ""),
          analysisMd,
          promptJson: json,
          jpgPath: path.join(brandDir, `${adId}.jpg`),
        });
      } catch {
        // skip malformed
      }
    }
  }

  CACHE = entries;
  return CACHE;
}

/**
 * Reference selector: pick the 2-3 closest reference ads for a given register
 * + awareness stage. Prefers diversity in brand.
 */
export async function selectReferences(params: {
  register: string; // from visual register taxonomy
  awarenessStage: string; // "problem" | etc.
  max?: number;
}): Promise<ReferenceAd[]> {
  const all = await loadReferenceLibrary();
  if (all.length === 0) return [];
  const max = params.max ?? 3;

  const stage = normalizeStage(params.awarenessStage);
  const registerLower = (params.register || "").toLowerCase();

  // Score each ad
  const scored = all.map((ad) => {
    let score = 0;
    if (normalizeStage(ad.awarenessStage) === stage) score += 3;
    if (ad.register.toLowerCase().includes(registerLower) && registerLower.length > 2) score += 2;
    // loose register token overlap
    for (const tok of registerLower.split(/[\s-]+/)) {
      if (tok.length > 2 && ad.register.toLowerCase().includes(tok)) score += 0.5;
    }
    return { ad, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Pick with brand diversity
  const chosen: ReferenceAd[] = [];
  const brands = new Set<string>();
  for (const { ad } of scored) {
    if (chosen.length >= max) break;
    if (brands.has(ad.brand) && chosen.length < max - 1) continue;
    chosen.push(ad);
    brands.add(ad.brand);
  }
  return chosen;
}
