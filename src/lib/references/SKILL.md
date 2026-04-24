---
name: ad-creative-generator-v2
description: "[EXPERIMENTAL — training on Notion/AG1/Airbnb/Duolingo reference ads] Generate ad creative concepts, copy, and photorealistic visuals for Meta ads using Nano Banana 2 (Kie.ai) with Dense Narrative prompting. Creates scroll-stopping creatives across awareness stages."
disable-model-invocation: false
allowed-tools: Read Write Edit Grep Glob WebSearch WebFetch
---

# Ad Creative Generator

Generate 10+ high-quality ad creatives across awareness stages. Takes a product brief, generates copy using proven frameworks (PAS, AIDA, BFB, 4U), and produces complete photorealistic ads via Nano Banana 2 full-bake (Track A default) — headlines, CTAs, and UI rendered as one cohesive image. Falls back to Track B (background + HTML composite) when surgical text specs aren't viable. Packages into organized ZIP.

---

## Output Directory (MANDATORY)

ALL output MUST go to the project-level `output/` directory:

```
/Users/lucentwu/Documents/Projects/Jarvis/output/
```

**Structure:**
```
output/
└── {brand}-creatives-{YYYY-MM-DD}/
    ├── prompts/          # Dense Narrative JSON prompts
    ├── backgrounds/      # AI-generated background PNGs
    ├── finals/           # Composited final creatives
    ├── {brand}-config.json
    └── _copy-sheet.md
```

**Rules:**
- NEVER write output to `.claude/skills/ad-creative-generator/output/` or any other location
- NEVER put loose files (markdown, config) directly in `output/` -- they go inside the campaign folder
- One campaign folder per brand per date
- Version iterations (v2, v3, etc.) go in subfolders within the campaign folder (e.g., `finals-v2/`, `backgrounds-v3/`)

---

## Design Excellence Principles (Reference-Tested)

These principles are reverse-engineered from high-performing creatives by AG1, Oura Ring, and Duolingo. Every creative MUST follow these. If a creative violates these principles, it will look generic and amateur.

### Foundational Design Rules (Numerical, Non-Negotiable)

These are concrete, codified rules from professional graphic design practice. They are NOT suggestions. Every creative MUST pass these before delivery.

**ATTENTION WINDOW**
- You have **0.3 seconds**. The primary visual and headline must register instantly. No clever puzzles, no small text that requires effort.
- Maximum **3 focal points** per ad: hero visual, headline, CTA. That's it. Every additional element fragments attention.

**TYPOGRAPHY MINIMUMS (at 1080px canvas width)**
- Hero text (headline/stat): **minimum 100px, ideal 120-180px.** At mobile display (1080px renders at ~375px), 100px renders at ~35px on-device. Below this, it blurs at scroll speed.
- Supporting text (subheadline): **minimum 40px, ideal 48-60px.** Anything below 40px is unreadable at scroll speed. If text doesn't merit 40px, cut it.
- CTA text: **minimum 36px** inside a button with **minimum 160px height.**
- Proof/credential text: **minimum 28px at 50%+ opacity.** If it's not worth 28px, delete it entirely -- invisible clutter is worse than no clutter.
- **Maximum 7 words in headline.** Aim for 3-5. Short headlines are processed in a single eye fixation (~250ms).
- **Type scale ratio: 1.6x between hierarchy levels.** If body is 44px, subhead is 70px, headline is 112px. This creates natural hierarchy.

**LAYOUT COMPOSITION**
- **Headline should occupy 25-40% of canvas height** (340-540px of 1350px). Less = doesn't dominate. More = crowds the visual.
- **Hero visual element should cover 40-60% of canvas.** One dominant thing -- the photo, the stat, the product. Not five small things.
- **Negative space: minimum 20-30% of canvas.** Cramped = cheap. Space = premium.
- **70/30 image-to-text ratio.** 70% visual, 30% text+UI. Less text outperforms more text every time.
- **Safe zones:** Top 14% (190px) and bottom 20% (270px) are overlaid by Instagram UI. Keep critical elements inside these margins or use them intentionally (solid CTA bar in bottom zone).
- **Z-pattern or F-pattern reading path.** Top-left → top-right → diagonal → bottom-left → bottom-right. Don't fight natural eye movement.

**CONTRAST & COLOR**
- **Minimum 4.5:1 contrast ratio for ALL text.** Aim for 7:1. Low contrast = invisible at scroll speed.
- **CTA must be the highest-contrast element on canvas.** It should visually "pop" above everything else.
- **3-4 colors max.** 60% dominant, 30% secondary, 10% accent. The accent color is your CTA.

**CTA & CONVERSION**
- **CTA button: minimum 160px tall, full brand accent color, not outline.** On-device this renders at ~53px -- the minimum tap target.
- **One clear action per ad.** Multiple CTAs, messages, or value props dilute everything.
- **Logo: 5-8% of canvas area (80-120px), corner placement.** It's a stamp, not a focal point.

---

### The 8 Rules of Premium Ad Design

**1. The Product IS the Visual**
- For app products: show the actual app UI, screenshots, or mockups as the hero visual
- For physical products: show the product with dramatic lighting and clean composition
- For service products (tutoring, consulting, SaaS without UI): the STAT or OFFER becomes the hero visual element. Use massive typography (200px+) as the visual anchor, backed by atmospheric photography.
- NEVER generate generic lifestyle photography as the main visual. The product must be visible and prominent.
- Duolingo shows the app. Oura shows the ring. AG1 shows the pouch. EdAtlas shows the "30%" or "45+". Follow this pattern.

**2. Aggressive Whitespace**
- Minimum 15-20% padding on all sides
- Let elements breathe. If it feels like there's "too much" empty space, it's probably right
- White/negative space IS a design element, not wasted space
- Reference: Oura ads use ~40% whitespace. That's why they feel premium.

**3. Typography as Design, Not Just Text**
- Use strategic weight contrast: bold key phrases, regular weight for context
- Use strategic italic emphasis on emotional words (AG1: "*feel grounded and perform my best*")
- One size for the headline, dramatically smaller for everything else (3:1 ratio minimum)
- Left-align or center, never justify. Left-align feels more editorial and modern.
- Max 2 font weights per creative. More = visual noise.

**4. Color Restraint (2-3 Colors Max)**
- One dominant background color (60%)
- One brand/accent color (30%)
- One text color (10%)
- NEVER use gradient overlays on photographs. Either clean background + text, OR full-bleed photo + minimal text.
- Reference: Duolingo uses ONE blue + white + green accent. That's it.

**5. One Clear Focal Point Per Ad**
- Every creative has ONE thing the eye goes to first
- Do not compete headline vs. image vs. CTA. One leads, others support.
- Hierarchy: Hero element > Headline > Supporting text > CTA
- If everything is bold, nothing is bold.

**6. Clean Layouts, Not Template Layouts**
- No visible "template structure" (centered-everything screams Canva)
- Asymmetric layouts feel more designed (offset text, product to one side)
- Use grid alignment but break it intentionally for visual interest
- Reference: AG1 testimonial ads place text top-left, not centered. Oura places product bottom-center with text above.

**7. Subtle Professional Details**
- Soft shadows, not hard drop shadows
- Rounded corners on UI elements (8-16px radius)
- Consistent spacing (use 8px grid)
- Accent elements as visual anchors (AG1's green sticker, Oura's score badges)
- Small text details (attribution, disclaimers) at much smaller size, muted color

**8. AI Backgrounds + Composited Text (The Proven Pipeline)**
- NEVER attempt pure HTML/CSS-only creatives. CSS shapes, gradients, and border-radius are NOT design. They produce flat, web-page-looking output that fails every time.
- The proven pipeline that produced good StatDoctor/Plandid creatives: **AI-generated photorealistic background via Kie.ai** + **text composited on top via Puppeteer/HTML**.
- The AI background provides atmosphere, texture, depth, and visual richness. The HTML layer provides crisp, pixel-perfect typography and CTA buttons.
- For dark backgrounds: use a gradient overlay (top-heavy or bottom-heavy) to create a readable text zone. Overlay opacity 60-75%.
- For bright/busy backgrounds: you MUST use a **solid or semi-solid backing panel** (glassmorphism card, solid color block, or heavy white gradient 85%+ opacity) behind the text. A subtle gradient overlay WILL NOT work on bright, detailed backgrounds -- the text will be invisible.
- ALWAYS verify the final composite by viewing it. If any text element is not immediately readable, the creative is broken.

### Audience Visual Register (Decision Framework — Run Before Picking an Approach)

Before you pick any visual approach, pick an **audience register** and state *why*. Visual register is how the ad needs to FEEL to the person scrolling — and it's determined by where that person lives on the internet and what their feed looks like. Cinematic editorial belongs on a billboard; it does NOT belong next to your cousin's IG story. Lo-fi UGC belongs in a teen's feed; it does NOT belong next to a luxury watch. Register mismatch is the single biggest reason ads feel "AI-generated" even when execution is clean.

Pick one explicitly. State the reasoning in the copy sheet. You can A/B-test across registers (e.g., test lo-fi UGC vs. editorial cinematic for the same brand), but the choice is always deliberate — never the default.

| Register | Choose when | Visual approach | Representative brands |
|---|---|---|---|
| **SaaS / B2B product** | Audience buys a workflow, productivity, or internal tool | App mockup as hero, clean studio-gradient bg, bold sans headline | StatDoctor, Plandid, Aligno, Duolingo-template |
| **Luxury DTC / Premium physical** | Premium consumer product sold on aspiration | Cinematic product hero, editorial lighting, 85mm f/2.0 aesthetic | AG1, Oura |
| **Youth service (student/teen)** | Primary viewer is 14-22, scrolls TikTok/IG feeds of peers | Lo-fi iPhone UGC photo + HTML-composited typography + dream-outcome imagery (graduation, celebration, acceptance moments). Natural daylight, not golden hour. | EdAtlas, edtech, tutoring, teen-facing apps |
| **Parent-facing service** | Primary viewer is 35-55, making a purchase decision for a child | Lifestyle documentary photography, real parent-child moments, muted warm palette, trust-forward typography | Premium tutoring pitched to parents, pediatric services |
| **Professional B2B service** | Consulting, agency, legal, advisory | Editorial portrait or environmental shot, restrained typography, confident quiet palette | Enaccelerator-style, consulting firms |

**Rule:** If you can't justify the register in one sentence (e.g., "EdAtlas targets 17-year-old VCE students scrolling IG; cinematic magazine aesthetic would read as 'commercial', not 'feed-native'"), the choice is wrong. Re-pick.

### Pipeline Discipline (Canonical vs. Exception)

**Canonical pipeline (use this by default): Track A full-bake — Nano Banana 2 renders the ENTIRE ad including typography in a single image.** Validated on the EatClub 2026-04-13 run: with surgical text specs, Nano Banana 2's typography rendering beat Puppeteer compositing on crispness, kerning, and layout precision. The model handles headlines, subheads, CTAs, and UI mockups as one cohesive image — no seams, no alignment drift, no overlay bugs.

**Track A is ONLY reliable when the prompt specifies every text element with surgical detail.** For each text element: exact wording, exact position (px or % from a named corner), exact font family + weight, exact size in px at canvas width, exact color hex, exact letter-spacing, line-height. Generic prompts like "bold headline top-left" produce garbage. See Section 8 for the full specification format.

**Exception — Track B (background-only + HTML composite):** Fall back to Track B when any of the following apply:
- You cannot or will not write surgical text specs for every element
- The ad requires a third-party brand logo or mascot that must be pixel-perfect (composite from brand kit)
- The ad requires a product UI screenshot with specific real interface state (composite from real screenshot)
- The ad requires multi-paragraph legal disclaimer text that exceeds what Track A can reliably render
- A Track A test run produced broken text and the budget won't support another iteration

**Never bake unspecified text/numbers into AI props.** Fake ATAR letters with hallucinated scores, fake names on AI portraits, fake score sheets, fake acceptance letters — these always read as AI tells. Either specify the exact text in the prompt (Track A) or composite the prop from a real source (Track B). Never leave text slots for the model to fill in on its own.

### Creative Type Guide by Product Type

**For App Products (like StatDoctor, Duolingo):**
- PRIMARY: App UI mockups on clean backgrounds
- PRIMARY: Feature screenshots with headline overlay
- SECONDARY: Data/stats visualizations with product context
- SECONDARY: Comparison graphics (old way vs. new way)
- AVOID: AI-generated lifestyle photos of people using phones

**For Physical Products (like AG1, Oura):**
- PRIMARY: Product hero shots with dramatic lighting
- PRIMARY: Lifestyle photography with product visible
- SECONDARY: Testimonial cards with real photography
- SECONDARY: Offer/bundle layouts showing what you get

**For Service Products (tutoring, consulting, agencies):**
- PRIMARY: AI-generated atmospheric backgrounds (moody desk scenes, premium environments, awards-style backdrops) + bold stat/offer composited on top
- PRIMARY: Bold hero stat as typographic art (massive "30%" or "45+") on rich photographic backgrounds
- SECONDARY: Social proof layouts with dux/client names on premium dark backgrounds
- AVOID: Pure HTML/CSS graphics (they look like web pages, not ads). AVOID generic stock-style study photos without atmosphere.

**For Youth-Audience Services (tutoring, edtech, teen-facing — EdAtlas, Duolingo-tier social proof):**
*Use when the Audience Visual Register points to "Youth service" — primary viewer is 14-22 and scrolls feeds dominated by peer UGC.*
- PRIMARY: **Lo-fi iPhone UGC backgrounds.** Authentic student-desk scenes, candid point-of-view shots, natural overcast daylight (NOT golden hour, NOT cinematic chiaroscuro). Think "a real Year 12 posted this to their story", not "a commercial crew shot this."
- PRIMARY: **Dream-outcome imagery** for aspirational angles — graduation caps mid-air, celebration moments, acceptance reactions. Legally safe: no visible faces, no identifiable university logos/crests/signage.
- PRIMARY: **Track A full-bake with surgical text specs** renders typography crisper than Puppeteer. Only fall back to Track B if you can't commit to full text specs or you need a real student-prop photo as backdrop (in which case: generate photo only, composite type).
- SECONDARY: Real student prop shots (open workbook with handwritten notes, messy desk, highlighter, water bottle) for problem/credibility framing.
- AVOID: Cinematic magazine editorial aesthetic (wrong register — reads as "commercial" to a teen). AVOID AI-generated faces of "students" (always uncanny). AVOID fake acceptance letters / fake ATAR documents with baked-in AI numbers. AVOID polished flatlays — they read as stock, not real.

**For Both/All:**
- Testimonial creatives with real names and titles
- Bold typography-only ads (headline + brand color background)
- Social proof + product combination layouts

### 8 — Full-Ad Prompting (CANONICAL DEFAULT — Track A)

Generate the COMPLETE ad as a single image via Nano Banana 2 / Kie.ai. The model handles typography, layout, and visual composition as one cohesive image. **This is now the default approach.** Validated by EatClub 2026-04-13: full-bake typography beat Puppeteer compositing on crispness and layout.

**Critical rule: every text element must be specified with surgical detail in a `text_elements_in_image` array.** Each element requires:
- `role` (e.g. "headline_line_1", "cta_button", "logo_wordmark")
- `content` — the exact wording verbatim
- `position` — exact px distances from named canvas/card corners (e.g. "90px from card left edge, 260px from card top edge")
- `font_family` — specific family + weight (e.g. "Inter ExtraBold 800", NOT "bold sans-serif")
- `size_px` — exact pixel size at canvas width
- `color_hex` — exact hex, or per-substring overrides for word-coloring
- `letter_spacing_em` — exact em value (e.g. -0.045 for tight display type)
- `line_height` — decimal multiplier for multi-line headlines
- For buttons/pills: `shape` (fill, border, corner radius, padding), plus font specs above

See `/Users/lucentwu/Documents/Projects/Jarvis/output/eatclub-creatives-2026-04-13/prompts/eatclub-01-dollar-anchor.v2-trackA.kie.json` and `eatclub-02-eat-out-editorial.v2-trackA.kie.json` as reference implementations — both rendered cleanly on first generation.

**If you're not willing to write specs at this detail, fall back to Track B.** Vague text prompts = AI-typography garbage.

**How to prompt for a full ad:**

The prompt must describe HOW to design it, not just WHAT to put on it. Include:

1. **Explicit design reference:** "in the style of a Duolingo app install campaign" or "like an Oura Ring product ad on Instagram"
2. **Background with texture/depth:** NEVER "flat gradient." Always specify texture, atmosphere, environment. "Dark navy background with subtle grain texture and soft warm light leak from upper left" or "light lavender background with soft frosted glass shapes and subtle noise texture"
3. **Pop color accent:** Every ad needs ONE element that jumps off the screen. A bright colored badge, a glowing accent, a colored border on the phone mockup. "bright indigo (#6366f1) accent glow behind the phone mockup" or "electric violet badge reading 'No fees' floating near the headline"
4. **Phone/product mockup direction:** If showing a phone, specify it should be "crisp, clean, with sharp readable UI text" and describe what the screen shows specifically. "iPhone 15 showing a clean shift-list interface with purple category cards, tab navigation, and clear readable text"
5. **Typography direction:** Specify font style, weight, alignment, and hierarchy. "Bold modern sans-serif headline, 800 weight, left-aligned, tight letter-spacing, taking up top 35% of canvas"
6. **Design details that show craft:** "phone mockup slightly rotated 5 degrees and overlapping the headline area" or "subtle shadow under the phone" or "headline with one word in a different color for emphasis"
7. **Emotional design layer:** What feeling should the visual create beyond the text? "Moody and confrontational" or "Clean and aspirational" or "Playful and approachable"

**Example full-ad prompt:**
```
Professional Instagram advertisement for StatDoctor app, 1080x1080. In the style of Duolingo's app install campaigns. Dark navy (#1e1b4b) background with subtle grain texture and soft diagonal light streaks. Bold white sans-serif headline 'Your agency takes a cut. Every single shift.' left-aligned, 800 weight, tight letter-spacing, top 35% of canvas. Below: iPhone 15 Pro mockup tilted 5 degrees right, showing clean shift-list UI with purple cards, sharp readable text. Phone has subtle indigo glow/shadow behind it. Bright electric violet (#7c3aed) pill badge floating top-right reading 'No hidden fees'. Small 'StatDoctor' wordmark top-left in white. Bold indigo CTA button at bottom 'See how'. Premium advertising design with visual layers, textures, and intentional asymmetry. Looks like a creative team designed this, not AI-generated.
```

**What separates "designer-quality" from "AI-generated":**
- TEXTURE: grain, noise, glass effects, material surfaces -- not flat solid colors
- LAYERS: multiple visual elements at different depths, overlapping, casting shadows
- TENSION: something breaking the grid -- a tilted phone, text overlapping an image, an element bleeding off the edge
- POP: one bright accent color element that grabs the eye immediately
- CRAFT DETAILS: subtle gradients on buttons, realistic shadows, consistent rounded corners, intentional spacing that feels considered not auto-generated

### Design Quality Checklist (Must Pass All)

Before delivering ANY creative, verify:
- [ ] Can you identify the single focal point in under 1 second?
- [ ] Is the product/app visible and prominent with CRISP, readable UI?
- [ ] Does it use 2-3 colors with at least ONE pop/accent color?
- [ ] Is there generous whitespace (15%+ padding)?
- [ ] Does the headline have clear size hierarchy over supporting text?
- [ ] Is there background TEXTURE (grain, light effects, depth) -- not flat color?
- [ ] Is there at least ONE design detail showing craft (tilt, overlap, glow, badge)?
- [ ] Would you scroll past this, or would it actually stop you?
- [ ] Does it look like a creative team made it, or like AI generated it?
- [ ] Is there an emotional/visual layer beyond just text + product?

---

## When to Use

Use this skill when:
- Launching a new campaign and need scroll-stopping creative assets
- Testing multiple angles/hooks for product-market fit
- Creating variations for A/B testing across funnel stages
- Need Meta-ready creatives (Feed, Stories, Reels formats)
- Want AI-generated images that look like real photography (not "AI art")

---

## Prerequisites

1. **Kie.ai API Key** — Sign up at [kie.ai](https://kie.ai) and get your key
2. **Python 3.8+** — Required for the Kie.ai integration script
3. **Node.js 18+** — For text compositing and packaging

---

## Setup

### 1. Install Dependencies

```bash
cd .claude/skills/ad-creative-generator
npm install
```

### 2. Configure API Key

Create `.env` in project root:

```bash
KIE_API_KEY=your-key-here
```

Or set environment variable:

```bash
export KIE_API_KEY="your-key-here"
```

---

## Workflow

### Step 1: Intake Brief & Brand Research

User provides product description. Before generating ANYTHING, do brand and market research.

**Required Info:**
- What's the product/service?
- Target audience (specific — "freelance designers", "SaaS founders")
- Main pain point you solve
- Key benefit/result
- Offer (free trial, discount, lead magnet)
- CTA (what should they do?)

**MANDATORY Brand Research (BLOCKING GATE -- NO generation without this):**

This step is NON-NEGOTIABLE. You MUST complete brand extraction before writing a single prompt. Do NOT guess colors based on industry, product type, or vibes. Do NOT assume dark mode for dev tools, blue for SaaS, etc. Every brand is different -- extract the truth from their actual website.

**Step 1: Automated Color Extraction via Playwright**
Write and run a Python Playwright script that:
1. Navigates to the client's website
2. Takes a screenshot (for visual reference)
3. Extracts computed styles from key elements via `page.evaluate()`:
   - All `<button>` and CTA elements: `backgroundColor`, `color`, `borderColor`
   - All `<a>` links: `color`
   - CSS custom properties from `:root` (`--primary`, `--accent`, `--brand`, etc.)
   - `document.body` background color and text color
   - All unique background colors on the page
4. Saves the screenshot and color data to the output directory

This gives you REAL hex codes, not guesses. WebFetch alone cannot extract computed CSS from dynamic sites (Next.js, React, etc.) -- Playwright is required.

**Step 2: Visual Verification**
- Open the screenshot and visually confirm: Is the site light mode or dark mode? What color are the CTAs? What does the logo look like?
- Cross-reference the extracted color data with what you see in the screenshot.

**Step 3: Document the Brand Palette**
Create a client config file (e.g., `aligno-config.json`) with:
- Primary accent color (hex) -- from CTA buttons
- Secondary accent (hex) -- from links, badges, hover states
- Background color (hex) -- light or dark mode base
- Text color (hex) -- headline and body
- CTA button style -- color, shape (pill vs square), text color
- Logo description -- color, position, mark vs wordmark
- Overall aesthetic -- light/dark, minimal/busy, editorial/playful
- Font style -- serif, sans-serif, weight used on headlines

**Store all brand research in the client config file so you never have to re-research.**

**CHECKPOINT: Do NOT proceed to Step 2 (Strategy Map) until the brand config file exists with real extracted colors. If Playwright is not available, use WebFetch + screenshot tools as fallback, but NEVER skip this step entirely.**

**Optional:**
- Landing page URL (for scraping context)
- Existing brand assets (logo, colors, fonts, past ads)
- Any specific hooks/angles to emphasize?
- Platform priority (Meta Feed, Stories, LinkedIn — default all)

**Category-Specific Creative Direction:**
The ad must reflect the BUSINESS CATEGORY, not default to generic tech/SaaS aesthetics.
- **Healthcare/medical:** Professional, trustworthy, clean. Teal/green/blue tones. Doctor imagery. Clinical but modern.
- **Finance/fintech:** Trustworthy, authoritative. Dark greens, navy, gold accents. Data-forward.
- **Education/edtech:** Playful, approachable, bright. Bold colors, mascots, illustrations.
- **E-commerce/DTC:** Lifestyle, aspirational. Product-forward, warm tones.
- **B2B SaaS:** Professional, clean, modern. Product screenshots prominent.
The creative should make someone in the target audience feel "this is for ME" at first glance based on the visual language of their industry.

### Step 2: Strategy Map

Based on inputs, map awareness stages and frameworks:

**Distribution (10 creatives):**
| Stage | Count | Visual Style | Frameworks |
|-------|-------|--------------|------------|
| Problem-aware | 2 | Emotional, candid, muted | PAS, story, curiosity |
| Solution-aware | 2 | Aspirational, bright | BFB, callout, AIDA |
| Product-aware | 3 | Professional, lifestyle | AIDA, 4U, testimonial |
| Most-aware | 3 | Bold, urgent, high contrast | 4U, urgency |

### Step 3: Generate Copy Matrix

For each creative, generate using proven frameworks:

**PAS (Problem-Agitate-Solution):**
1. Identify specific pain
2. Amplify emotional cost
3. Present solution

**AIDA (Attention-Interest-Desire-Action):**
1. Pattern interrupt hook
2. Relatable context
3. Benefits + social proof
4. Direct CTA

**BFB (Before-After-Bridge):**
1. Current struggle
2. Desired outcome
3. How to get there

**4U Framework:**
- Urgent, Unique, Useful, Ultra-specific

Each creative includes:
- Headline (max 8 words, scroll-stopping)
- Subheadline (optional, max 15 words)
- CTA text
- Visual direction (for image generation)

### Step 4: Generate AI Images (Nano Banana 2)

Choose the right visual approach based on product type:

**Approach A: Clean Design Backgrounds (App/SaaS Products)**
Best for: StatDoctor, Duolingo-style creatives. Generate clean, gradient, or textured backgrounds that text and mockups will be composited onto.

```json
{
  "prompt": "Clean minimalist background, soft gradient from [brand color] to white, subtle abstract shapes, premium advertising aesthetic, no text, no people, studio lighting, commercial photography backdrop, high-end brand campaign style, 8k resolution",
  "negative_prompt": "text, words, letters, people, faces, hands, cluttered, busy, objects, products, logos, watermarks"
}
```

**Approach B: Product Hero Shots (Physical Products)**
Best for: AG1, Oura-style creatives. Dramatic product photography with the product as the clear hero.

```json
{
  "prompt": "Professional product photography of [product] on [surface/setting]. Dramatic studio lighting, clean composition, shallow depth of field, 85mm lens, f/2.0. Premium commercial aesthetic, luxury brand photography style. [Color palette]. 8k resolution.",
  "negative_prompt": "text, watermark, cluttered, busy, amateur, low quality, multiple products, distracting background"
}
```

**Approach C: Lifestyle Context (When People Are Needed)**
Only use when the creative specifically requires a person (testimonial-style, UGC-style). The product must still be visible.

```json
{
  "prompt": "Professional lifestyle photography, [person description] using [product]. Shot with 85mm lens, f/2.0, ISO 200. Documentary realism, candid moment. Product clearly visible. Clean background, shallow depth of field. Do not beautify or alter features. 8k resolution.",
  "negative_prompt": "text, watermark, cartoon, illustration, plastic skin, skin smoothing, AI generated look, cluttered background, busy composition"
}
```

**Process:**
1. Choose approach (A, B, or C) based on creative concept
2. Build Dense Narrative JSON
3. Call Kie.ai API (createTask → poll → download)
4. ~30-60 seconds per image
5. Save background image
6. Composite text/mockups on top

**Critical Rule:** For app products, Approach A (clean backgrounds) should be used for 70%+ of creatives. The app UI mockup IS the visual -- the AI-generated image is just the backdrop.

### Step 5: Text Compositing (Designer-Quality)

Using Sharp to composite text overlays. Follow reference ad principles:

**Layout Styles (not just text positions):**
- `editorial-left` — Left-aligned headline, top area, supporting text below (AG1 testimonial style)
- `hero-center` — Large centered headline with product below (Oura style)
- `app-showcase` — Headline left/top, app mockup right/bottom (Duolingo style)
- `data-driven` — Big stat/number as hero, context text below, product accent
- `minimal-quote` — Large quote text with attribution, full-bleed photo behind
- `offer-layout` — Product lineup with pricing/offer details (AG1 offer style)

**Typography Rules (Updated April 2026 — minimum sizes for mobile readability):**
- Hero headline/stat: **100-180px**, font-weight 800-900, tight letter-spacing (-2px). Must occupy 25-40% of canvas height.
- Supporting text/subheadline: **44-64px**, font-weight 500-700. NEVER below 40px. If it's not worth 40px, delete it.
- CTA text: **36-44px**, font-weight 700, inside a pill button with **minimum 160px height**.
- Proof/credential text: **28-36px at 50%+ opacity.** If not worth 28px, cut entirely.
- Size ratio between headline and body: **minimum 1.6x** (golden ratio scale)
- Maximum 7 words in headline. Aim for 3-5.
- Use italic emphasis on 1-2 emotional words in the headline (like AG1 does)
- NEVER use all-caps for more than 3 words

**Color Rules for Text:**
- Dark text on light backgrounds (primary brand color or near-black)
- White text on dark/photo backgrounds (with text-shadow: `0 3px 24px rgba(0,0,0,0.5)` for readability)
- CTA button: brand accent color, white text, 32px border-radius (pill shape), with box-shadow for pop
- Gradient overlays are REQUIRED when compositing text over photographic backgrounds, but they must be tuned to the specific background brightness:
  - Dark backgrounds: 60-75% opacity gradient overlay in the text zone
  - Bright backgrounds: 85%+ opacity white gradient, OR use a solid backing panel (glassmorphism card with `backdrop-filter: blur(20px)` and 80%+ opacity background)
  - Busy/detailed backgrounds: solid color block behind text, not gradient. Gradients fail on non-uniform backgrounds.

**Spacing Rules:**
- Padding: minimum 60px on all sides (1080px canvas)
- Gap between headline and subheadline: 24-32px
- Gap between body text and CTA: 48-64px
- Text should occupy max 60% of the canvas area

**Accent Elements:**
- Small badge/sticker for offers (like AG1's green "FREE" badge)
- Thin separator lines between sections
- Small icons next to feature bullet points (like Oura's metric icons)
- Brand logo: small, positioned top-center or bottom-center, muted

### Step 6: Package Output

Create ZIP with organized folder structure:

```
ad-creatives-[campaign-name]-[date]/
├── 01-problem-aware/
│   ├── 01-pas-curious-1-1.png
│   ├── 01-pas-curious-9-16.png
│   └── ...
├── 02-solution-aware/
├── 03-product-aware/
├── 04-most-aware/
└── _copy-sheet.md
```

### Step 6.5: MANDATORY QA Gate (Before ANY Output)

**NO creative is shown to the user until it passes ALL checks below.** This gate exists to prevent wasting the user's time and API credits. If a creative fails any check, fix it BEFORE generating or showing output.

#### Pre-Generation QA (Before spending API credits)

Run these checks on the COPY and LAYOUT PLAN before calling the image generation API:

**Copy Load Check:**
- [ ] MAX 3 text elements total (headline + optional subheadline + CTA). If you have more, cut.
- [ ] Headline is 8 words or fewer
- [ ] Subheadline is 12 words or fewer (or absent)
- [ ] CTA is 4 words or fewer
- [ ] No duplicate messages (headline and subheadline shouldn't say the same thing differently)
- FAIL ACTION: Rewrite the copy until it passes. Do NOT generate an image with bloated copy.

**Visual Anchor Check:**
- [ ] Creative plan includes at least ONE of: app mockup, product image, logo/brand mark, bold accent shape
- [ ] The visual anchor is the thing the eye lands on -- not just text on a background
- FAIL ACTION: Add a visual anchor to the plan. For app products, default to phone mockup + brand wordmark.

**Contrast Plan Check:**
- [ ] If background is dark (>50% dark area): ALL text must be white or very light
- [ ] If background is light: headline text must be dark/near-black, NOT gray
- [ ] CTA button must have high contrast against background (solid fill, not outline)
- [ ] If background is bright AND busy (detailed photo with bright areas): you MUST use a solid backing panel, glassmorphism card, or 85%+ opacity white overlay behind text. A subtle gradient overlay WILL fail on bright busy backgrounds. This was proven with the EdAtlas bright desk creative where the headline was completely invisible.
- FAIL ACTION: Adjust the text color plan before generating.

**Background-Text Compatibility Check (NEW — from EdAtlas failures):**
- [ ] For EVERY text element, verify it has a readable zone behind it. Atmospheric backgrounds are NOT uniform — confetti, light streaks, and detailed textures will kill readability in specific areas even if the "average" brightness is fine.
- [ ] If using a gradient overlay on a photo: the overlay must be at MINIMUM 60% opacity in the text zone. Less than this = invisible text.
- [ ] If the background has strong visual elements (gold confetti, diagonal light streaks, textbook pages, furniture), the overlay MUST be heavy enough that text is legible OVER those specific elements, not just over the average background.
- [ ] Plan the text position AROUND the background content, not on top of it. If the background has a hero subject in the center, put text at top or bottom, not center.
- FAIL ACTION: Increase overlay opacity, add a solid backing panel behind text, or reposition text to a cleaner area of the background.

#### Post-Generation QA (After compositing, before showing to user)

View the final composited image and verify:

**1. Readability & Text Quality (Instant Kill — VIEW THE ACTUAL IMAGE)**
- [ ] **VIEW THE FINAL PNG.** Do not assume text is visible because it's in the HTML. You MUST read the output image and confirm every text element is actually visible. This is the #1 failure mode — text that exists in code but is invisible in the render.
- [ ] Can you read every word at 400px thumbnail size? If not, FAIL.
- [ ] Is there sufficient contrast between ALL text and its background area? Check SPECIFICALLY where each text element sits against the background — not the average background brightness.
- [ ] Is the headline large enough to read in 0.5 seconds while scrolling?
- [ ] Is the CTA button visible and readable? An ad without a visible CTA is not an ad, it's a poster. INSTANT KILL.
- [ ] Are ANY letters overlapping or colliding with each other or with badges/labels? Zoom in and check. If yes = FAIL.
- [ ] Are there any misspelled words or gibberish text anywhere (including inside phone mockups)?
- [ ] Is there only ONE element that looks like a CTA button? Multiple pill-shaped elements = confusion = FAIL.
- [ ] Does any text element collide with or overlap another text element? (e.g., badge text overlapping headline, description running into a label). If yes = FAIL.
- FAIL = Increase overlay opacity in the text zone, add a solid backing panel, reposition text, or switch to a dark background where white text is guaranteed to be readable.

**2. Visual Weight**
- [ ] Does the headline take up at least 15-20% of the canvas area?
- [ ] Is there a clear visual anchor (not just text floating on a gradient)?
- [ ] Does the eye have ONE place to land first?
- FAIL = The creative feels like a text document. Needs a visual anchor or bolder layout.

**3. Copy Density & Element Count**
- [ ] Count the text elements. More than 3 (headline + sub + CTA) = FAIL.
- [ ] Is there breathing room between every element (48px+ gaps)?
- [ ] Does text occupy less than 50% of the total canvas?
- [ ] Is there only ONE pill/button-shaped element? Floating badges that look like CTAs create confusion. If you need a supporting message, use plain text -- not a pill that competes with the real CTA.
- [ ] Count total distinct visual elements (headline, sub, CTA, phone, badge, logo). More than 5 = too busy. Cut the weakest.
- FAIL = Too crowded or too many competing elements. Simplify.

**4. Brand Presence**
- [ ] Is there a brand wordmark or logo visible (even small)?
- [ ] Would someone who sees this ad know who it's from?
- FAIL = Add brand mark. Small, muted, top or bottom.

**5. Design Craft (The "Did a Creative Team Make This?" Test)**
- [ ] Is there background TEXTURE? (grain, noise, light effects, material surfaces) If it's a flat solid color or flat gradient = FAIL.
- [ ] Are there MULTIPLE VISUAL LAYERS? (not just bg + text + phone stacked neatly). Elements should overlap, cast shadows, create depth.
- [ ] Is there at least ONE element that BREAKS THE GRID? (tilted phone, text overlapping image, element bleeding off edge, unexpected crop)
- [ ] Is there a POP COLOR ACCENT? (bright badge, colored glow, accent element that jumps off screen). If everything is the same 2 muted tones = FAIL.
- [ ] Do UI mockups have CRISP, READABLE text inside them? If the phone screen text is blurry or gibberish = FAIL.
- [ ] Does this look like something Duolingo's creative team would ship? Be honest.
- FAIL = The prompt needs more design direction. Add texture, layers, tension, and pop.

**6. Emotional Design Layer**
- [ ] Does the visual create a FEELING beyond just conveying information?
- [ ] Is there something visually interesting that makes you want to look longer?
- [ ] Would someone save/screenshot this ad because it looks good?
- FAIL = The creative is purely informational. Rethink with an emotional/visual hook.

**7. Overall Scroll-Stop Test**
- [ ] Put this next to an AG1, Oura, or Duolingo ad. Does it hold up?
- [ ] Would this stop YOU from scrolling in a feed full of bright, happy ads?
- [ ] Is there something here that a "normal student with no design experience" could NOT have made?
- FAIL = The creative is not ready. Rewrite the prompt with more design direction, texture, layers, and craft.

**If ANY check fails:** Fix the issue and re-run QA. Do NOT show the creative to the user.
**If ALL checks pass:** Present the creative with a brief QA summary noting what passed.

#### Credit Conservation Rule
Never call the image generation API until Pre-Generation QA passes. The background image is the expensive part. Text compositing is free. Get the plan right first, generate the image once.

#### Known Failure Modes (Hard-Learned, April 2026)

These are specific failures that have shipped to the user before. If ANY of these patterns appear in your work, the QA gate has failed. Fix before showing.

**FAILURE 1: "Ghost Text" — Text exists in HTML but is invisible in the render.**
- Root cause: Gradient overlay is too transparent over a bright/busy background. The text is technically there but has zero contrast against the background.
- How it happened: EdAtlas creative #03 had a white gradient overlay on a bright study desk photo. The overlay was only 65% at its strongest point. The 72px headline was completely invisible.
- Prevention: After compositing, READ THE OUTPUT IMAGE with the Read tool. If you cannot see the headline in the image, the creative is broken. For bright backgrounds, use 85%+ opacity or a solid backing panel.

**FAILURE 2: "Missing CTA" — The ad has no visible call to action.**
- Root cause: CTA button or text positioned in a zone where the background overwhelms it, or positioned off-canvas due to layout math errors.
- How it happened: EdAtlas creative #04 had a CTA at `bottom: 100px` but the awards-ceremony confetti background made everything below the hero stat unreadable.
- Prevention: The CTA must be in a GUARANTEED readable zone. Either: (a) inside a solid/semi-solid backing panel, (b) in an area with 70%+ overlay opacity, or (c) in the bottom strip/bar with solid background. Never float a CTA over a busy atmospheric background.

**FAILURE 3: "Hero element off-canvas" — The main visual/text is clipped.**
- Root cause: Using `transform: translateY(-55%)` or aggressive positioning that pushes content outside the viewport.
- How it happened: EdAtlas creative #04 had the "16" hero stat at `top: 50%; transform: translateY(-55%)` which pushed it partially off the top edge at 260px font size.
- Prevention: For hero text larger than 200px, use absolute `top` positioning (e.g., `top: 160px`), NOT transform-based centering. Always account for actual rendered height of large text.

**FAILURE 4: "Element collision" — Text elements overlapping each other.**
- Root cause: Absolute positioning without accounting for the actual rendered size of nearby elements.
- How it happened: EdAtlas creative #05 had "Zero commitment" text colliding with the "LIMITED SPOTS" badge.
- Prevention: Leave minimum 40px vertical gap between any two text elements. For badges/labels, position them with explicit offsets that account for surrounding content.

**FAILURE 5: "CSS-only creative" — Attempting graphic design with pure HTML/CSS.**
- Root cause: Abandoning AI image generation and trying to create the entire visual with CSS gradients, shapes, and border-radius.
- How it happened: EdAtlas v3 and v4 were pure HTML/CSS. They looked like web page components, not ads. CSS rectangles with border-radius are not design.
- Prevention: ALWAYS use AI-generated backgrounds for the visual richness layer. CSS handles typography, CTAs, and layout. AI handles atmosphere, texture, depth, and photography. Never skip the AI background step.

**FAILURE 6: "Proof strip too small" — Bottom stats/credentials invisible at scroll speed.**
- Root cause: Using 13px font at 35% opacity for important social proof numbers.
- How it happened: Every EdAtlas creative had bottom stats at 13px/35% opacity — invisible at Instagram scroll speed.
- Prevention: If proof points are important enough to include, they must be at minimum 15px and 50% opacity on dark backgrounds. If they're not important enough to be readable, cut them entirely — don't add invisible clutter.

### Step 7: Review & Deliver

Show preview of all creatives with:
- Stage label
- Framework used
- Copy text (headline, CTA)
- QA summary (which checks passed)
- Recommended use case

After user approval, generate final ZIP for download.

---

## Creative Specifications

### Static Feed (1:1)
- Size: 1080x1080px
- Safe zone: Keep text within 80% center
- Text: Max 20% of image (Meta guideline)

### Static Feed (4:5)
- Size: 1080x1350px
- Best for longer copy

### Stories/Reels (9:16)
- Size: 1080x1920px
- Top/bottom safe zones for UI
- Hook in first 3 seconds

---

## Dense Narrative Best Practices

### For Clean Design Backgrounds (Primary Approach for App Products)
- `minimalist, clean, premium brand aesthetic`
- `soft gradient, subtle texture, studio backdrop`
- `commercial advertising background, high-end`
- `no people, no objects, no clutter`
- Specify exact color palette: `color palette of [hex1] transitioning to [hex2]`

### For Product Photography (Physical Products)
- `85mm lens, f/2.0, ISO 200` — Forces optical physics
- `shallow depth of field` — Realistic bokeh
- `commercial product photography, studio lighting`
- `premium brand, luxury aesthetic`

### For Lifestyle Shots (Use Sparingly)
- Camera mathematics still apply (85mm, f/2.0)
- `Do not beautify or alter facial features`
- `Documentary realism style, candid`
- Product must be visible in the shot

### Comprehensive Negative Blockers
```
text, words, letters, numbers, watermark, logo, cartoon, illustration,
clip art, cluttered, busy, amateur, cheap, stock photo,
plastic skin, skin smoothing, airbrushed texture,
AI generated look, digital art, render, CGI,
multiple focal points, distracting elements
```

### Key Principle
The AI-generated image is the BACKDROP, not the entire creative. The final creative is built by compositing text, mockups, and design elements ON TOP of this image. Generate backgrounds that leave clean space for text overlays.

---

## Output Format

### Preview Display
```
**Creative 01 — Problem-Aware**
Framework: PAS
Visual: Freelancer working late, exhausted, dramatic lighting

[IMAGE PREVIEW]

**Headline:** "Still invoicing at 11pm?"
**Subheadline:** "68% of freelancers say billing is their #1 stress"
**CTA:** "See how it works →"
**Style:** Bold text, centered, gradient overlay

**Best For:** Cold audiences who don't know you yet
```

### Copy Sheet (_copy-sheet.md)
Markdown table with all copy and metadata.

---

## Best Practices

1. **Hook in first 3 seconds** — For video scripts and Stories
2. **One message per creative** — Don't try to say everything
3. **Contrast wins** — Visual and message should stop the scroll
4. **Test stages** — Run problem-aware to cold, most-aware to retargeting
5. **Refresh every 2-4 weeks** — Creative fatigue is real
6. **Use Dense Narrative** — Camera settings + imperfections = photorealism

---

## Integration Notes

- Output is manual download (ZIP of PNGs)
- User uploads manually to Meta Ads Manager
- Copy sheet can be copied to Google Sheets/Notion for tracking
- Future: Direct API integration to Meta

---

## Example Workflow

**User:** "I sell a time-tracking app for freelancers who hate invoicing"

**Skill:**
1. Asks clarifying questions (audience, pain, offer)
2. Maps to 10 creatives across awareness stages
3. Generates copy using PAS, AIDA, etc.
4. Builds Dense Narrative prompts for each visual
5. Calls Kie.ai API to generate photorealistic images
6. Composites text overlays with brand colors
7. Packages organized ZIP
8. Shows preview with recommendations

**Output:** 20 PNGs (10 creatives × 2 formats), organized by stage, ready for Meta Ads Manager

---

## Cost & Performance

- **Cost:** ~$0.04-0.09 per image via Kie.ai
- **Time:** ~30-60 seconds per image generation
- **Full batch:** 10 creatives × 2 formats = ~20 minutes

---

## Troubleshooting

**"KIE_API_KEY not found"**
→ Check `.env` file exists or set `export KIE_API_KEY="..."`

**Python not found**
→ Install Python 3.8+: `brew install python3` (Mac)

**Images look "AI-generated"**
→ Ensure Dense Narrative includes explicit imperfections
→ Verify comprehensive negative blockers are used
→ Check camera settings (85mm, f/2.0) are specified

**Task fails on Kie.ai**
→ Check account has credits
→ Try simpler prompt
→ Verify API key is correct

---

## Reference Ad Library (v2 Training)

A curated library of top-tier ad creatives from Notion, AG1, Airbnb, Duolingo, Shopify, and Kalshi is available at:

`/Users/lucentwu/Documents/Projects/Jarvis/references/ad-library/`

**MANDATORY in Strategy phase:**
1. Read `references/ad-library/README.md` for the index.
2. Identify the brief's awareness stage and brand register (see Audience Register table above).
3. Pull 2–3 matching ad analyses from the library.
4. Reference the specific patterns those ads exemplify (see `_patterns.md`) when drafting the creative brief.
5. Cite the reference ad(s) by filename in the copy-sheet's "Design Inspiration" section.

**Library structure:**
- `notion/` (6 ads) — SaaS/B2B Editorial register
- `ag1/` (3 ads) — Luxury DTC / Editorial register
- `airbnb/` (3 ads) — Luxury DTC / Hospitality register
- `duolingo/` (2 ads) — Youth / Gamified Consumer register
- `shopify/` (3 ads) — Creator / Maker Lifestyle register
- `kalshi/` (1 ad) — Editorial Finance register
- `_patterns.md` — distilled cross-brand patterns (this is the canonical source for rules below)

Each ad has a `.md` file alongside the image covering: awareness stage, angle, concept, copy breakdown, design analysis, why-it-converts, Creative Director lens, Media Buyer lens, and transferable patterns.

---

## Canonical Patterns from Top Brands

These 15 patterns are distilled from the Reference Ad Library and recurred in 2+ brands. They are the v2 skill's training injection — apply them in the Creative/Prompting phase when they match the brief's awareness stage and register.

### Copy Patterns

**CP-1. Dollar-anchored headline for Product/Most-Aware stages.** Lead with a specific dollar figure, not a benefit. "$12,000 of Free Notion" / "$72 Free Welcome Kit" / "$100 into $1,516." Never for solution- or problem-aware stages.

**CP-2. Hedge big numbers with "Up to" or "Over."** Unhedged numbers read as clickbait. "Up to $12,000" / "Over 2 million ratings."

**CP-3. Verb-rhythm parallelism for Solution-Aware headlines.** 2-4 short parallel verbs ending in periods. No "and." "Organize everything. Accomplish anything." / "Quick. Easy. Airbnb." / "Dream it. Map it. Build it. Share it. Your way."

**CP-4. Italic-within-quote for testimonial emphasis.** Italicize the single phrase carrying the desired brand association — readers remember only the italic fragment.

**CP-5. Occupation-based testimonial attribution.** "US Open Winner" / "Science Teacher" / "Founder - Eastside Golf" beats "Verified Customer."

**CP-6. CTA-as-objection-handler.** Put the #1 customer objection into the CTA button text. "Free Trial with Full AI Access" handles AI-gating. "Claim Your FREE Welcome Kit" reframes cost as gift.

**CP-7. Dual-CTA ladder.** Soft CTA top-right ("Get Started Free") + primary CTA below ("Free 3 Month Trial, Full AI Access"). Serves two commitment levels simultaneously.

### Design Patterns

**DP-1. Proprietary illustration > stock or AI imagery.** Even simple line art in a consistent house style beats photorealism for brand equity. Never use stock photography in any output.

**DP-2. Editorial serif on cream = luxury DTC default.** For premium products ($40+/mo or $100+ retail): serif headline (Canela/Tiempos), off-white/cream canvas (#F2ECE3–#EEEAE0), single brand-color accent in logo only.

**DP-3. Card-in-frame / ad-as-product-window.** Frame the ad as a rounded card mimicking a browser window or app surface. Include visible UI chrome. The ad IS the product.

**DP-4. 3-color maximum palette.** Every ad in the reference library uses 3 colors max plus minor accents. Accent color appears in exactly ONE place (logo OR CTA OR a highlighted word).

**DP-5. Surgical word-coloring.** Color only the 2-3 offer words; leave rest black. Blue "$12,000" + red "free" in an otherwise black headline.

**DP-6. Real product UI screenshots > feature illustrations.** Actual screens at thumbnail scale beat mockups and icon grids for SaaS/app brands.

**DP-7. Logo-tiny or logo-off as confidence.** If the product UI is recognizable, shrink or omit the logo. A giant logo signals insecurity.

**DP-8. Negative space >50%.** Restraint signals confidence. Busy ads signal insecurity.

**DP-9. Warm vs. cool canvas for audience segmentation.** Warm (yellow/orange/cream) = creators/DTC/Instagram. Cool (blue/gray/white) = enterprise/B2B/LinkedIn. A/B same layout in two canvas colors.

**DP-10. One hand-drawn accent on flat layout.** Include exactly one imperfect/analog element (highlighter, stamp, marker) to humanize otherwise clean design.

### Anti-Patterns (hard bans — these brands NEVER do these)

- **No stock photography.** Ever.
- **No "ACT NOW"/"LIMITED TIME"/all-caps urgency bark.**
- **No gradient meshes, glassmorphism, "AI aesthetic."**
- **No drop shadows on type.**
- **No text outlines or text effects.**
- **No exclamation marks** (zero found in all 18 reference ads).
- **No emoji in ad copy.**
- **No CTAs in all caps.**
- **No feature bullet lists** (use visual proof instead — screenshots, product grids, logo rings).

### Awareness Stage → Pattern Mapping

| Stage | Prefer | Avoid |
|-------|--------|-------|
| Unaware | News-cycle reactive, cast-the-audience portraits, editorial serif | Feature lists, pricing, CTAs |
| Problem Aware | "Turn your X into Y" transformation copy, radical simplicity for ESL, founder collage, passion archetype grids | Dollar anchors, feature callouts |
| Solution Aware | Verb-rhythm parallelism, italic testimonial, occupation attribution, editorial serif, product-UI-as-ad | Urgent CTAs, "BUY NOW" |
| Product Aware | Dollar anchor, hedged numbers, CTA-as-objection-handler, card-in-frame, surgical word color, real UI screenshots | Long brand stories, category education |
| Most Aware | Dollar anchor, CTA-as-objection, dual CTA, product-UI-as-ad for retargeting | First-impression elements, over-explanation |

---

## Prompt Writer Training Corpus (Nano Banana 2 JSON)

**Research-backed default:** Nano Banana 2 JSON prompts achieve ~92% precision (vs ~68% for natural language) and run 2-3x faster. Every prompt this skill writes for Nano Banana 2 MUST be JSON.

A full corpus of 18 reverse-engineered ad prompts lives at:

`/Users/lucentwu/Documents/Projects/Jarvis/references/ad-library/{brand}/{ad-slug}.prompt.json`

Each file contains both **Track A (full-bake, text included in image-gen)** and **Track B (background only + text composited in post)**, plus creative direction reasoning, brand asset handling, and prompt-writer training notes.

### Mandatory workflow

**Every time you write a Nano Banana 2 image-gen prompt, follow these 10 steps:**

1. Determine brand register (Luxury DTC / SaaS Editorial / Youth / Creator Lifestyle / Editorial Finance). See per-register conventions in `_prompt-meta-patterns.md` Part 4.
2. Determine awareness stage (Unaware → Most Aware).
3. **Open 2 closest reference prompts** from `references/ad-library/` by register + stage. Model their structure.
4. Write the `creative_direction` block FIRST — approach + reasoning + concept one-liner. Don't skip.
5. Decide **Track A or Track B** using the decision tree below. Document the reasoning.
6. Draft the `scene` field with 5-7 high-signal terms (camera / subject / environment / mood).
7. Fill the 10 non-negotiable fields: `scene`, `subject`, `environment`, `camera`, `lighting`, `color_palette` (with hex + coverage_pct), `composition`, `style_directives`, `text_elements_in_image` or `reserved_text_zones`, `negative_prompt`.
8. List brand assets with `fidelity_confidence` and `fallback_composite_source`.
9. Write `prompt_writer_training_notes` (3-5 bullets of what future-you needs).
10. Validate JSON: `python3 -c "import json; json.load(open(...))"`.

### Track A vs Track B decision tree

```
Default: Track A full-bake.
├── Are you willing to write surgical text specs for every text element?
│   (exact wording + position + font + size + color + letter-spacing per element)
│   ├── NO → Track B
│   └── YES → continue
├── Does the ad require a third-party brand logo/mascot with pixel-perfect fidelity?
│   (Duolingo Duo, real Slack/GitHub/Jira logos, etc.)
│   ├── YES → Track B (composite the asset)
│   └── NO → continue
├── Does the ad require a real product UI screenshot (actual interface, not mock)?
│   ├── YES → Track B (composite the screenshot)
│   └── NO → continue
├── Does the ad require multi-paragraph legal disclaimer text?
│   ├── YES → Track B
│   └── NO → Track A
```

**Observed default: Track A full-bake is now the canonical approach.** EatClub 2026-04-13 validated Nano Banana 2's typography rendering beats HTML compositing when surgical text specs are provided. Reference corpus ads were mostly reverse-engineered as Track B because the earlier skill version defaulted to it — re-reading those same ads, most would Track A cleanly with the right specs.

### The 8 specificity rules (hard rules, not guidelines)

1. **Describe details, don't claim quality.** ❌ "highly detailed, 8k, masterpiece" / ✅ "pores visible on skin, 1px light gray border"
2. **Name visual lineages by reference brand/publication.** ❌ "elegant luxury" / ✅ "reference: Aesop, Le Labo, Glossier" or "New Yorker editorial illustration"
3. **Hex colors with coverage percentages.** ❌ "yellow background" / ✅ `{ "hex": "#FFD63A", "role": "canvas", "coverage_pct": 55 }`
4. **Camera specifics even for flat graphics.** Set `lens_mm: null, aperture: null, angle: "flat graphic"` to prevent unwanted bokeh.
5. **Type specs must name the family.** ❌ "bold font" / ✅ "Inter / Söhne ExtraBold" or "Canela / Tiempos editorial serif"
6. **5-7 high-signal details in `scene`, exhaustive detail in nested fields.** Image-gen research: 5-7 keywords = 90% of desired elements.
7. **Negative prompts are structural.** ❌ "not bad quality" / ✅ "no drop shadows on text, no gradient mesh, no glassmorphism, no emoji, no exclamation marks, no stock photo feel"
8. **One variable change per iteration.** Change camera OR palette OR wardrobe — never multiple at once.

### Default negative_prompt baseline

Every prompt MUST include these (add ad-specific negatives on top):

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
  "no photorealism when rendering flat graphics",
  "no generic system fonts (Arial, Helvetica default)",
  "no blurred or unrecognizable brand logos"
]
```

### Brand asset fidelity guide

| Confidence | Asset types | Strategy |
|------------|-------------|----------|
| High | Simple geometric shapes, pills, rounded cards, basic flags | Generate directly |
| Medium | Wordmarks, country flags, simple packaging | Generate + verify; iterate if off |
| Low | Mascots (Duo, Notion characters), complex UI screens, third-party logos (Slack/GitHub/Jira) | Composite from brand kit |

Always flag `fidelity_confidence: "low"` assets and plan composite fallback up front. Don't burn credits iterating.

### Exemplar: the best-crafted JSON prompt in the library

**Primary exemplar: `references/ad-library/notion/notion-ad-4.prompt.json`** — open this FIRST when writing any new prompt. It is the structural model. Replace the content, not the shape.

It is the gold standard because:
1. Full Track A + Track B both specified with exhaustive detail.
2. Hybrid creative-direction reasoning (explicit about why image-gen handles card surface but composite handles surgical word-coloring).
3. 9 patterns from `_patterns.md` cited in `patterns_exemplified`.
4. Brand assets have prompt language + composite fallback + fidelity confidence each.
5. `prompt_writer_training_notes` distills 6 transferable lessons.

Inlined abbreviated view of the exemplar (read the full file for complete specs):

```json
{
  "schema_version": "1.0",
  "ad_id": "notion-ad-4",
  "brand": "Notion",
  "awareness_stage": "Product Aware",
  "register": "SaaS/B2B Editorial",

  "creative_direction": {
    "approach": "hybrid",
    "reasoning": "Card-in-frame archetype: card surface + window chrome + product UI strip must be generated (Track A elements) but headline + offer line with surgical word-coloring ($12,000 blue, 'free' red) + CTA pills need pixel-perfect compositing. Track B recommended.",
    "concept_one_liner": "Ad presents itself as a Notion page on a yellow desk — product UI screenshots become the proof layer."
  },

  "canvas": { "aspect_ratio": "1:1", "dimensions_px": "1080x1080" },

  "prompt_track_B_background_only": {
    "nano_banana_json": {
      "scene": "Flat-lay: white rounded card on warm yellow canvas, with two ghosted offset card silhouettes behind implying a stack. Card has Notion logo top-left, blue Get Started Free pill top-right, and three overlapping Notion UI screenshot panels in bottom 33%. Middle 50% of card is reserved blank white space for overlaid text.",
      "camera": { "angle": "flat graphic, top-down" },
      "lighting": { "style": "flat render, no shadows" },
      "color_palette": [
        { "hex": "#FFD63A", "role": "canvas yellow", "coverage_pct": 30 },
        { "hex": "#FFFFFF", "role": "card surface", "coverage_pct": 55 },
        { "hex": "#000000", "role": "typography", "coverage_pct": 10 },
        { "hex": "#2D7FF9", "role": "Get Started Free pill", "coverage_pct": 3 }
      ],
      "composition": {
        "layout_archetype": "card-in-frame",
        "reserved_text_zones": [
          { "role": "headline", "bbox_pct": { "x": [10, 90], "y": [22, 48] } },
          { "role": "offer_line", "bbox_pct": { "x": [10, 90], "y": [48, 58] } },
          { "role": "ai_access_pill", "bbox_pct": { "x": [20, 80], "y": [58, 68] } }
        ]
      },
      "style_directives": ["flat 2D graphic design, editorial SaaS", "Notion/Linear/Vercel design language"],
      "negative_prompt": ["no baked-in text in reserved zones", "no stock photo feel", "no gradient mesh", "no drop shadows on text", "no photorealism"]
    },
    "text_overlay_spec": {
      "elements": [
        { "role": "headline", "content": "Automate Your\nDaily Tasks", "font_family": "Inter / Söhne ExtraBold", "size_px": 100, "color_hex": "#000000", "alignment": "center", "line_height": 0.98 },
        { "role": "offer_line", "content": "Get up to $12,000 of free Notion", "font_family": "Inter / Söhne SemiBold", "size_px": 44, "color_hex": "#000000", "color_overrides": [{ "substring": "$12,000", "color_hex": "#2D7FF9" }, { "substring": "free", "color_hex": "#E84B3B" }] }
      ]
    }
  }
}
```

### Secondary exemplars by register

- **Luxury DTC / Editorial:** `ag1/ag1-ad-2.prompt.json` (Sloane testimonial — hardest-pose specification)
- **Editorial Finance:** `kalshi/kalshi-ad-1.prompt.json` (editorial illustration style done right)
- **Creator / Maker Lifestyle:** `shopify/shopify-ad-1.prompt.json` (casting language)
- **Youth / Mascot:** `duolingo/duolingo-ad-1.prompt.json` (proprietary mascot handling)

### 5 most common prompt-writing mistakes to avoid

1. Vague style directives (use reference brands/publications instead).
2. Missing camera fields on flat graphics (forces unwanted depth-of-field).
3. Generic color names instead of hex.
4. Writing Track A prompts without surgical text specs — vague text descriptions produce AI-typography garbage. Every text element needs: exact wording + position + font family+weight + size + color + letter-spacing + line-height.
5. Fewer than 6 negative_prompt entries.

### Full canonical source

For full details on every pattern, convention, and field, read: `references/ad-library/_prompt-meta-patterns.md`.

