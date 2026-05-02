/**
 * stitchBreakdowns — turns N saved style breakdowns into M ad-prompt seeds.
 *
 * Strategy (the "blend brand fields, pick one structural" approach):
 * - Brand fields blend across all loved breakdowns: palette, mood, lighting,
 *   density. These define the user's overall brand feel and should feel
 *   consistent across every generated ad.
 * - Structural fields are picked one-per-output: composition.layout_archetype,
 *   subject_placement, conversion_anatomy, ui_elements.headline + cta. So each
 *   generated ad inherits the structural DNA of one specific reference.
 *
 * Result: M ads that all wear the user's brand colours and tone, but each one
 * has a distinct compositional flavour (e.g. one in AG1's hero-product style,
 * one in Notion's screenshot-mockup style, one in Linear's gradient-text
 * style — all on the user's palette and using their voice).
 */
import type { StyleBreakdown } from "./schema";

export interface AdPromptSeed {
  /** Blended palette across all loved refs — feeds the prompt's color list. */
  palette: Array<{ hex: string; role?: string; coverage_pct?: number }>;
  /** Blended mood + lighting + textures — defines the brand feel. */
  brandFeel: {
    mood: string;
    lighting: string;
    textures: string[];
    styleFamilies: string[];
    avoidList: string[];
  };
  /** Picked from ONE specific reference — gives this ad its compositional DNA. */
  structural: {
    sourceIndex: number;
    layoutArchetype: string;
    subjectPlacement?: string;
    framing?: string;
    aspectRatio: string;
    headlineTreatment: string;
    ctaTreatment: string;
    conversionAnatomy: StyleBreakdown["conversion_anatomy"];
    adWorldReference?: string;
  };
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function blendPalette(
  breakdowns: StyleBreakdown[],
): AdPromptSeed["palette"] {
  // Take each ref's top 3 colors by coverage, then dedupe by hex (case-insensitive).
  const all: AdPromptSeed["palette"] = [];
  for (const b of breakdowns) {
    const sorted = [...b.materials.palette].sort(
      (a, c) => (c.coverage_pct ?? 0) - (a.coverage_pct ?? 0),
    );
    all.push(...sorted.slice(0, 3));
  }
  const seen = new Set<string>();
  const out: AdPromptSeed["palette"] = [];
  for (const p of all) {
    const key = (p.hex || "").toUpperCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= 8) break;
  }
  return out;
}

function blendBrandFeel(
  breakdowns: StyleBreakdown[],
): AdPromptSeed["brandFeel"] {
  const moods = uniq(
    breakdowns.map((b) => b.technical?.mood).filter((s): s is string => !!s),
  );
  const lightings = uniq(
    breakdowns.map((b) => b.technical?.lighting).filter((s): s is string => !!s),
  );
  const textures = uniq(
    breakdowns.flatMap((b) => b.materials?.textures ?? []),
  );
  const styleFamilies = uniq(breakdowns.map((b) => b.style).filter(Boolean));
  const avoidList = uniq(
    breakdowns.flatMap((b) => b.quality?.avoid ?? []),
  );
  return {
    mood: moods.slice(0, 3).join(", ") || "calm, intentional",
    lighting:
      lightings.slice(0, 2).join(" or ") || "soft studio softbox",
    textures: textures.slice(0, 5),
    styleFamilies: styleFamilies.slice(0, 3),
    avoidList: avoidList.slice(0, 8),
  };
}

function pickStructural(
  breakdown: StyleBreakdown,
  index: number,
): AdPromptSeed["structural"] {
  const headlineTreatment = breakdown.ui_elements?.headline
    ? `${breakdown.ui_elements.headline.treatment ?? "sans"}, ${
        breakdown.ui_elements.headline.size_relative ?? "dominant"
      }, positioned ${breakdown.ui_elements.headline.position ?? "top"}`
    : "sans, dominant, positioned top";
  const ctaTreatment = breakdown.ui_elements?.cta
    ? `${breakdown.ui_elements.cta.treatment ?? "filled"} ${
        breakdown.ui_elements.cta.shape ?? "pill"
      } at ${breakdown.ui_elements.cta.position ?? "bottom-centre"}`
    : "no explicit CTA — let the headline carry the action";

  return {
    sourceIndex: index,
    layoutArchetype: breakdown.composition?.layout_archetype ?? "centered hero",
    subjectPlacement: breakdown.composition?.subject_placement,
    framing: breakdown.composition?.framing,
    aspectRatio: breakdown.aspect_ratio || "1:1",
    headlineTreatment,
    ctaTreatment,
    conversionAnatomy: breakdown.conversion_anatomy,
    adWorldReference: breakdown.ad_world_references?.[0],
  };
}

/**
 * Produce `count` AdPromptSeeds. Brand fields are shared across all seeds;
 * each seed picks its structural DNA from one specific breakdown, rotating
 * through the loved set so we get variety even when the user wants more
 * outputs than they loved.
 */
export function stitchBreakdowns(
  breakdowns: StyleBreakdown[],
  count: number,
): AdPromptSeed[] {
  if (breakdowns.length === 0 || count <= 0) return [];

  const palette = blendPalette(breakdowns);
  const brandFeel = blendBrandFeel(breakdowns);

  const seeds: AdPromptSeed[] = [];
  for (let i = 0; i < count; i++) {
    const sourceIndex = i % breakdowns.length;
    seeds.push({
      palette,
      brandFeel,
      structural: pickStructural(breakdowns[sourceIndex], sourceIndex),
    });
  }
  return seeds;
}

/**
 * Render an AdPromptSeed into a compact text block that gets pasted into
 * the Art Director's prompt-writer brief. Plain text, not JSON — easier
 * for the LLM to weave naturally into the Dense Narrative output.
 */
export function renderSeedForPrompt(seed: AdPromptSeed): string {
  const paletteLine = seed.palette
    .map((p) => `${p.hex}${p.role ? ` (${p.role})` : ""}`)
    .join(", ");

  return `Style guide stitched from the user's saved style references:
  Palette to honour: ${paletteLine}
  Brand feel: ${seed.brandFeel.mood} — lighting ${seed.brandFeel.lighting}
  Style families to channel: ${seed.brandFeel.styleFamilies.join(", ")}
  Textures: ${seed.brandFeel.textures.join(", ") || "(none specified)"}

  Structural DNA for THIS specific creative (inherited from one loved reference):
    Layout archetype: ${seed.structural.layoutArchetype}
    Subject placement: ${seed.structural.subjectPlacement ?? "(unspecified)"}
    Framing: ${seed.structural.framing ?? "(unspecified)"}
    Aspect ratio: ${seed.structural.aspectRatio}
    Headline treatment: ${seed.structural.headlineTreatment}
    CTA treatment: ${seed.structural.ctaTreatment}
    Eye landing point: ${seed.structural.conversionAnatomy.eye_landing_point}
    Stop-the-scroll lever: ${seed.structural.conversionAnatomy.stop_the_scroll}
    ${seed.structural.adWorldReference ? `Reference vibe: ${seed.structural.adWorldReference}` : ""}

  Hard avoid (from the user's curated set): ${seed.brandFeel.avoidList.join("; ") || "(none)"}`;
}
