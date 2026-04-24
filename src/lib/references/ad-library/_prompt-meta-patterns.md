# Prompt Meta-Patterns — What Makes a Good Nano Banana 2 JSON Prompt

Distilled from reverse-engineering 18 top-tier reference ads (Notion×6, AG1×3, Airbnb×3, Duolingo×2, Shopify×3, Kalshi×1) into reproducible Nano Banana 2 JSON prompts. This document is the training payload for the `ad-creative-generator-v2` skill's prompt-writer layer.

**Research basis:** Nano Banana 2 JSON prompts achieve ~92% precision vs ~68% for natural language, and run 2-3x faster (200-700ms vs 500ms-1.2s). Nano Banana skips the natural-language-to-parameter step and matches JSON fields directly to internal settings.

---

## Part 1 — The Non-Negotiable Structure

**Every good prompt JSON has these 10 fields.** If a field is missing, the prompt underperforms.

1. **`scene`** — one sentence describing the overall composition. Sets the lexical frame.
2. **`subject`** — what/who is the focal element. Include pose, wardrobe, expression, skin tone, position in frame.
3. **`environment`** — location, background elements, props. Never "generic."
4. **`camera`** — lens_mm + aperture + angle + distance + framing. Even for flat graphics, specify `angle: "flat graphic"` so image-gen skips depth-of-field.
5. **`lighting`** — key / fill / mood / shadows. Four sub-fields minimum for photographic prompts.
6. **`color_palette`** — array of `{hex, role, coverage_pct}` objects. Every color has a role. Coverage percentages force you to think about dominance hierarchy.
7. **`composition`** — layout_archetype + focal_points + negative_space_pct + optional vertical_zones array.
8. **`style_directives`** — 3-5 short bullets referencing specific visual lineages ("Aesop / Le Labo / Glossier", "New Yorker editorial ink", "Nike 'You Can't Stop Us'"). Image-gen models recognize brand references.
9. **`text_elements_in_image`** (Track A) OR **`reserved_text_zones`** (Track B) — explicit typography spec OR explicit empty-zone coordinates.
10. **`negative_prompt`** — structural boundaries. Minimum 6 entries.

---

## Part 2 — Specificity Rules (2026 best practices codified)

### Rule 1: Describe details, don't claim quality.
- ❌ "highly detailed, 8k, masterpiece"  →  junk tokens, drift to stock feel
- ✅ "pores visible on skin, subtle film grain, crisp 1px border on card" → concrete

### Rule 2: Name visual lineages by reference brand or publication.
- ❌ "elegant luxury feel"
- ✅ "reference: Aesop, Le Labo, Glossier" or "New Yorker editorial illustration"

### Rule 3: Hex colors with coverage percentages, always.
- ❌ "green background"
- ✅ `{ "hex": "#1CB0F6", "role": "Duolingo cobalt canvas", "coverage_pct": 55 }`

### Rule 4: Camera specifics even for non-photographic work.
- Photographic ads: lens_mm (35mm=environmental, 50mm=natural, 85mm=product/portrait), aperture (f/1.4-f/2.0 for shallow DOF, f/5.6-f/8 for product flat-lay), angle, distance.
- Graphic/flat ads: `lens_mm: null`, `aperture: null`, `angle: "flat graphic"` — prevents image-gen from introducing unwanted bokeh.

### Rule 5: Type specs must name the family.
- ❌ "bold font"
- ✅ "Canela / Tiempos / editorial high-contrast serif" or "Inter / Söhne ExtraBold"

### Rule 6: 5-7 high-signal details front-loaded in `scene`, exhaustive detail in nested fields.
Per image-gen research, 5-7 keywords yield 90% of desired elements. The `scene` field should carry the highest-signal 5-7; the rest of the schema holds exhaustive detail that image-gen uses without diluting the primary signal.

### Rule 7: Negative prompts must be structural, not aspirational.
- ❌ "not bad quality"
- ✅ "no drop shadows on text, no gradient mesh, no glassmorphism, no emoji, no exclamation marks, no stock photo feel"

### Rule 8: One variable change per iteration.
When iterating, change one field at a time (camera distance OR palette OR wardrobe). Never more. This is standard 2026 image-gen practice and confirmed by all research sources.

---

## Part 3 — The Track A vs Track B Decision Framework

**THIS IS THE CORE CREATIVE-DIRECTION DECISION.** Every prompt must declare Track A (full-bake including text) or Track B (background only + text composited in post), with explicit reasoning.

### Decision Tree

```
Does the ad have marketing copy (headline, offer, CTA) that must be pixel-perfect?
├── YES, pixel-perfect required
│   ├── Dollar figures with surgical word-coloring? → Track B (always)
│   ├── Specific brand-tagline typography? → Track B
│   ├── Multi-line legal disclaimers? → Track B
│   ├── Custom font licensing or brand type system? → Track B
│   └── Otherwise → Track B preferred, Track A as experiment
│
└── NO, text is UI chrome or ambient
    ├── Phone UI screen text? → Track A (image-gen handles UI well)
    ├── In-scene signage / signage-as-scenery? → Track A
    ├── The entire ad is one big typographic moment with only minor imagery? → Track B (text must be perfect)
    └── Ad has NO marketing text at all (e.g., Airbnb Ad 1)? → Track A works either way
```

### Track A vs Track B — Observed Distribution in Reference Library

| Track | Count | Examples |
|-------|-------|----------|
| Track B recommended | 17/18 | All Notion, AG1-1, AG1-3, all Airbnb (hybrid), all Duolingo, all Shopify, Kalshi |
| Track A viable | 1/18 | Airbnb Ad 1 (no marketing text) |

**Takeaway:** Track B is the default for ads with marketing copy. Track A is for UI-only or text-free moments.

### `creative_direction` block — ALWAYS include this reasoning

Every JSON has a `creative_direction` object with:
- `approach`: "imagery-heavy" | "typography-heavy" | "hybrid"
- `reasoning`: 2-3 sentence explicit argument
- `concept_one_liner`: the single creative idea

This forces the prompt-writer to defend the approach. Never just pick Track B because it's safe — articulate why.

---

## Part 4 — Per-Register Prompt Conventions

Different brand registers require different prompting defaults.

### Luxury DTC / Editorial (AG1, Airbnb — 6 ads)
- Canvas: warm cream/stone (`#EEEAE0` to `#F2ECE3`) — NOT pure white
- Typography: editorial serif (Canela / Tiempos) for headlines, clean sans for labels
- Camera: 85mm f/5.6 for product flat-lays; f/1.4 for environmental portraits
- Lighting: "soft large softbox" / "natural daylight" — NEVER harsh
- Style reference: "Aesop, Le Labo, Glossier, Apple iPhone ads"
- Logo: always tiny, often absent
- Negative space: >60% of canvas

### SaaS/B2B Editorial (Notion — 6 ads)
- Canvas: off-white (`#F7F7F5`), warm yellow (`#FFD63A`), or cool blue (`#6BB8F0`) — audience segmentation
- Typography: geometric ExtraBold sans (Inter / Söhne / Notion's own)
- Camera: `angle: "flat graphic"` for card-in-frame; `lens_mm: null`
- Lighting: `style: "flat render, no shadows"`
- Style reference: "Notion, Linear, Vercel design language"
- Signature move: card-in-frame + real UI screenshots
- Color palette: max 3 colors + 2 surgical-accent words

### Youth / Gamified Consumer (Duolingo — 2 ads)
- Canvas: saturated single brand color (`#1CB0F6` Duolingo cobalt) OR pure white
- Typography: rounded geometric sans (Feather Bold / Nunito Rounded), often lowercase
- Camera: flat illustration
- Style reference: "Duolingo house illustration style" — explicit naming
- Mascot: proprietary, composite from brand kit (image-gen unreliable)

### Creator / Maker Lifestyle (Shopify — 3 ads)
- Canvas: off-white (`#F5F5F5`) or natural-photo dominant
- Typography: clean sentence-case sans (Shopify Sans / Inter Regular)
- Camera: 35mm f/2.8 (environmental portraits); natural daylight
- Style reference: "Glossier, Parade, Airbnb host campaigns, NOT stock photography"
- Casting: "real creator-founders, Gen Z aesthetic, non-traditional styling"
- Imagery: hands-at-work > faces-at-camera

### Editorial Finance (Kalshi — 1 ad)
- Canvas: warm off-white cream (`#F3F0E9`)
- Typography: editorial ExtraBold sans (Söhne / Inter) + terminal/bracket-edge monospace for numbers
- Camera: flat editorial poster
- Style reference: "New Yorker editorial illustration, FT Weekend, vintage sports zine"
- Illustration: line-art + flat color fills (NEVER photorealistic)

---

## Part 5 — Cross-Cutting Negative-Prompt Baseline

Every prompt in the library includes most of these. Use as the default negative-prompt list:

```json
"negative_prompt": [
  "no drop shadows on text",
  "no gradient mesh",
  "no glassmorphism",
  "no 'AI aesthetic' feel",
  "no stock photography",
  "no emoji in copy",
  "no exclamation marks",
  "no text outlines or text effects",
  "no all-caps CTAs (unless specified)",
  "no photorealism (when rendering flat graphics)",
  "no generic system fonts (Arial, Helvetica default)",
  "no blurred or unrecognizable brand logos",
  "no watermarks or 'AD' badges"
]
```

Add ad-specific negatives on top of this baseline (e.g., "no studio-lit portrait" for UGC ads).

---

## Part 6 — Brand Asset Handling

**The rule:** image-gen can't reliably reproduce specific brand logos, mascots, or UI screens on first pass.

Every prompt has a `brand_assets` block that documents:
- `name` — what the asset is
- `prompt_language_for_image_gen` — the exact language to use for Track A or the first pass
- `fallback_composite_source` — path to brand-kit asset for composite fallback
- `fidelity_confidence`: "high" | "medium" | "low" — expected first-pass accuracy

Assets by fidelity confidence from the library:
- **High fidelity** (image-gen does well): simple geometric shapes (pills, rounded cards, flags with basic patterns)
- **Medium fidelity** (usually works, iterate): wordmarks, country flags, simple product packaging
- **Low fidelity** (composite recommended): mascots (Duo the owl, Notion's characters), specific UI screens with many components, third-party logos (Slack/GitHub/Jira)

**Takeaway:** Always plan for composite fallback for `low` fidelity assets. Don't waste credits iterating.

---

## Part 7 — Field-by-Field Specificity Scorecard

Based on the library, here's how specific each field should be:

| Field | Minimum specificity | Example |
|-------|---------------------|---------|
| `scene` | One sentence, 5-7 high-signal terms | "Editorial studio flat-lay: 6 AG1 products in forest green on cream canvas, serif headline top" |
| `subject.description` | Age range + ethnicity + build + action | "30s Black professional tennis player mid-serve" |
| `subject.pose` | Limb positions + head direction + body angle | "right arm raised high holding racket up-right, head tilted up toward racket" |
| `subject.wardrobe` | Garment type + color hex + pattern notes | "pale aqua (#A8D8D0) sleeveless athletic dress with subtle vertical pleats" |
| `subject.skin` | Specific descriptor, avoid generic terms | "rich dark brown skin tone, visible muscle definition" |
| `environment.location` | Specific setting, not category | "professional hard-court tennis surface" not "tennis court" |
| `camera.lens_mm` | Always specific (35, 50, 85) or `null` for flat | `85` |
| `camera.aperture` | Always specific (f/1.4, f/2.8, f/5.6) or `null` | `"f/1.4"` |
| `camera.angle` | Named: "eye-level", "high-angle 30-45°", "overhead flat-lay", "flat graphic" | `"overhead high-angle 30-45°"` |
| `lighting.key_light` | Direction + softness + temperature | `"natural outdoor daylight from upper-left, strong directional but softened"` |
| `color_palette.hex` | Full 6-char hex, never color name | `"#FFD63A"` not "yellow" |
| `color_palette.coverage_pct` | Sum to ~100 | enforces dominance thinking |
| `composition.layout_archetype` | Name it: "card-in-frame", "apothecary grid", "text-sandwich", "peripheral collage" | `"card-in-frame"` |
| `style_directives` | Reference brands/publications | `"Aesop, Le Labo, Glossier"` |
| `negative_prompt` | 6+ structural boundaries | see Part 5 |

---

## Part 8 — The Exemplar Prompt (best-in-class reference)

The single best-crafted prompt in the library is **`notion/notion-ad-4.prompt.json`**. It's the gold standard because:

1. Exercises both Track A and Track B with full specs.
2. Handles hybrid creative direction (image gen + composite) with explicit reasoning.
3. Surgical word-coloring (blue "$12,000", red "free") is correctly pushed to Track B text overlay.
4. Product UI strip is specified in enough detail that image-gen produces recognizable Notion views.
5. Dual CTA (top-right + center) is structurally documented.
6. `prompt_writer_training_notes` distills 6 specific lessons.

**When writing a new prompt, open `notion-ad-4.prompt.json` first and model its structure.** Replace the content, not the shape.

Secondary exemplars by register:
- **Luxury DTC:** `ag1/ag1-ad-2.prompt.json` (Sloane testimonial — hardest-pose prompt in library)
- **Editorial Finance:** `kalshi/kalshi-ad-1.prompt.json` (illustration style reference done right)
- **Creator Lifestyle:** `shopify/shopify-ad-1.prompt.json` (casting language)
- **Youth / Mascot:** `duolingo/duolingo-ad-1.prompt.json` (proprietary mascot handling)

---

## Part 9 — The 10-Step Prompt-Writing Workflow

When writing a new Nano Banana 2 prompt for a brief:

1. **Determine register** (Luxury DTC / SaaS Editorial / Youth / Creator / Editorial Finance). Open the matching per-register convention in Part 4.
2. **Determine awareness stage** (Unaware → Most Aware). Open `_patterns.md` for stage → pattern mapping.
3. **Pick 2 closest reference prompts** from the library by register + stage.
4. **Write the `creative_direction` block first** — approach + reasoning + concept one-liner. Don't skip this.
5. **Decide Track A or Track B** using Part 3 decision tree.
6. **Draft the `scene` field** with 5-7 high-signal terms (camera / subject / environment / mood).
7. **Fill the 10 non-negotiable structure fields** per Part 1.
8. **List brand assets** with fidelity confidence and composite fallback paths.
9. **Write `prompt_writer_training_notes`** — what would future-you need to know to iterate this prompt? 3-5 bullets minimum.
10. **Validate:** run the JSON through `python3 -c "import json; json.load(open(...))"`. Ensure all required fields are populated and coverage percentages in color_palette sum to ~100.

---

## Part 10 — The 5 Most Common Prompt-Writing Mistakes

1. **Vague style directives.** "Elegant and modern" means nothing. Name brands/publications.
2. **Missing camera fields on graphic work.** Causes image-gen to introduce depth-of-field or lighting effects on flat compositions.
3. **Generic color names.** "Warm yellow" produces inconsistent hex; `#FFD63A` is reproducible.
4. **Track A when Track B is needed.** Losing pixel-accuracy on headline hex colors = losing brand integrity.
5. **Short negative_prompt.** Fewer than 6 entries = structural drift. Always include the Part 5 baseline.
