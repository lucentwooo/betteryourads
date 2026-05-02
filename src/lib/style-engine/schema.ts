/**
 * StyleBreakdown — a structured JSON description of an ad's visual style.
 *
 * Adapted from Alex's open-source JSON Prompt Generator schema, with three
 * ad-specific additions:
 *   - aspect_ratio (1:1, 4:5, 9:16) for Meta placements
 *   - ui_elements (mandatory) — headline, CTA, logo placement
 *   - conversion_anatomy — eye-landing point, CTA hierarchy, proof element
 *
 * Loose-typed because vision LLMs occasionally drift the shape; we validate
 * the load-bearing fields and tolerate the rest.
 */

export interface StyleBreakdown {
  /** "1:1" | "4:5" | "9:16" */
  aspect_ratio: string;
  /** What kind of ad this is in plain language. */
  scene: string;
  /** Compositional style — editorial / studio / lifestyle / meme / testimonial / product-grid */
  style: string;
  technical: {
    camera?: string;
    lens?: string;
    lighting?: string;
    mood?: string;
  };
  materials: {
    /** Surface and material vocab — paper, glass, metal, gradient, etc. */
    palette: Array<{ hex: string; role?: string; coverage_pct?: number }>;
    textures?: string[];
  };
  environment: {
    background: string;
    props?: string[];
  };
  composition: {
    /** "centered hero" | "rule-of-thirds" | "product-grid" | "split-screen" | "asymmetric" */
    layout_archetype: string;
    subject_placement?: string;
    framing?: string;
    negative_space_pct?: number;
  };
  /** Mandatory for ads — this is what makes it stop the scroll. */
  ui_elements: {
    headline?: { position: string; size_relative: string; treatment: string };
    cta?: { position: string; shape: string; treatment: string };
    logo?: { position: string; size_relative: string };
    other?: string[];
  };
  /** New section — what makes this convert. */
  conversion_anatomy: {
    eye_landing_point: string;
    cta_hierarchy: string;
    proof_element?: string;
    stop_the_scroll: string;
  };
  quality: {
    include?: string[];
    avoid?: string[];
  };
  /** Free-form references — Notion, AG1, Linear, Oura, Airbnb. */
  ad_world_references?: string[];
}

export interface BreakdownContext {
  industry?: string;
  awarenessStage?: string;
  brandName?: string;
}

/**
 * Validate a parsed JSON object as a StyleBreakdown. Returns the breakdown
 * with sensible defaults for missing optional fields, or null if a
 * load-bearing field is missing.
 */
export function validateBreakdown(input: unknown): StyleBreakdown | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;

  // Load-bearing fields. If any are missing we treat the whole breakdown
  // as a bad parse — the stitcher relies on these.
  const required = [
    "aspect_ratio",
    "scene",
    "style",
    "materials",
    "composition",
    "ui_elements",
    "conversion_anatomy",
  ];
  for (const f of required) {
    if (o[f] === undefined || o[f] === null) return null;
  }

  const materials = o.materials as Record<string, unknown>;
  if (!Array.isArray(materials.palette) || materials.palette.length === 0) {
    return null;
  }

  const composition = o.composition as Record<string, unknown>;
  if (typeof composition.layout_archetype !== "string") return null;

  const conversionAnatomy = o.conversion_anatomy as Record<string, unknown>;
  if (
    typeof conversionAnatomy.eye_landing_point !== "string" ||
    typeof conversionAnatomy.stop_the_scroll !== "string"
  ) {
    return null;
  }

  return {
    aspect_ratio: String(o.aspect_ratio),
    scene: String(o.scene),
    style: String(o.style),
    technical: (o.technical as StyleBreakdown["technical"]) ?? {},
    materials: {
      palette: (materials.palette as StyleBreakdown["materials"]["palette"]) ?? [],
      textures: (materials.textures as string[]) ?? [],
    },
    environment: (o.environment as StyleBreakdown["environment"]) ?? {
      background: "",
    },
    composition: {
      layout_archetype: String(composition.layout_archetype),
      subject_placement: (composition.subject_placement as string) ?? undefined,
      framing: (composition.framing as string) ?? undefined,
      negative_space_pct:
        typeof composition.negative_space_pct === "number"
          ? composition.negative_space_pct
          : undefined,
    },
    ui_elements: o.ui_elements as StyleBreakdown["ui_elements"],
    conversion_anatomy: {
      eye_landing_point: String(conversionAnatomy.eye_landing_point),
      cta_hierarchy: String(conversionAnatomy.cta_hierarchy ?? ""),
      proof_element: (conversionAnatomy.proof_element as string) ?? undefined,
      stop_the_scroll: String(conversionAnatomy.stop_the_scroll),
    },
    quality: (o.quality as StyleBreakdown["quality"]) ?? {},
    ad_world_references: (o.ad_world_references as string[]) ?? [],
  };
}
