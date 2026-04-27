import type { Job, JobStatus, ProgressStep } from "./types";

export const MOCK_JOB: Job = {
  id: "mock-001",
  status: "complete",
  input: {
    companyName: "Tally",
    companyUrl: "https://tally.so",
    competitors: ["Typeform", "Jotform", "Google Forms"],
  },
  progress: [
    { step: "Website scanned", detail: "Captured screenshot and extracted 4521 characters", timestamp: new Date().toISOString() },
    { step: "Brand extracted", detail: "Found primary color #6c47ff, font Inter", timestamp: new Date().toISOString() },
    { step: "Ads found", detail: "Found 3 active ads", timestamp: new Date().toISOString() },
    { step: "Typeform done", detail: "Found 4 ads", timestamp: new Date().toISOString() },
    { step: "Jotform done", detail: "Found 2 ads", timestamp: new Date().toISOString() },
    { step: "Diagnosis complete", detail: "Full analysis ready", timestamp: new Date().toISOString() },
  ],
  brandProfile: {
    colors: {
      primary: "#6c47ff",
      secondary: "#1a1a2e",
      accent: "#f5f3ff",
      background: "#ffffff",
      text: "#1a1a2e",
    },
    typography: {
      primary: "Inter",
      secondary: "DM Sans",
      headingWeight: 700,
      bodyWeight: 400,
    },
    visualStyle: {
      mode: "light",
      ctaShape: "pill button",
      corners: "pill",
      aesthetic: "light-mode, modern, bold",
    },
    tone: "Friendly, approachable, slightly playful",
    dosAndDonts: {
      do: [
        "Use #6c47ff as the primary action color for CTAs and key UI elements",
        "Keep layouts clean with generous whitespace -- Tally's brand is minimal",
        "Use Inter for all text; keep headlines bold (700) and body regular (400)",
        "Lead with simplicity messaging -- 'the simplest way to create forms'",
      ],
      dont: [
        "Don't use more than 3 colors in a single ad creative",
        "Don't use dark/moody backgrounds -- Tally's brand is light and airy",
        "Don't use stock photography -- product screenshots and illustrations fit better",
        "Don't write long-form copy -- Tally's voice is short, punchy, and direct",
      ],
    },
  },
  companyAds: [
    {
      screenshotPath: "",
      copyText: "Create beautiful forms in seconds. No coding required. Free forever for basic use. Try Tally today.",
      source: "meta-ad-library",
    },
    {
      screenshotPath: "",
      copyText: "Tired of clunky form builders? Tally is the simplest way to create forms that look great and just work.",
      source: "meta-ad-library",
    },
  ],
  competitorData: [
    {
      name: "Typeform",
      ads: [
        {
          screenshotPath: "",
          copyText: "Make every interaction count. Typeform helps you collect data with beautiful, engaging forms people actually enjoy filling out.",
          source: "meta-ad-library",
        },
        {
          screenshotPath: "",
          copyText: "Stop losing leads to boring forms. Typeform's conversational approach gets 3x more completions.",
          source: "meta-ad-library",
        },
      ],
    },
    {
      name: "Jotform",
      ads: [
        {
          screenshotPath: "",
          copyText: "Build powerful forms with 10,000+ templates. Jotform -- trusted by 25M+ users worldwide.",
          source: "meta-ad-library",
        },
      ],
    },
    {
      name: "Google Forms",
      ads: [],
    },
  ],
  diagnosis: {
    tldr: `- You run 6 ads. All say "forms are easy."
- Only people shopping for forms see you. Most people don't.
- You need ads that say "your spreadsheet sucks" first.
- Your rivals have big numbers (25M users). You have none.
- Hit them with "you'll love this if you love Notion."`,
    executiveSummary: "Tally's biggest strategic gap is a near-total absence of Problem Aware and Unaware stage creative. All current ads assume the viewer already knows they need a form builder and is comparing options. This means Tally is only competing for the ~20% of potential customers who are actively shopping -- missing the 80% who don't yet realize their current workflow (spreadsheets, email, manual data collection) is the problem. The fix: allocate 60% of creative budget to top-of-funnel concepts that create the problem before presenting the solution.",

    brandProfile: `Tally presents a clean, modern, developer-friendly brand identity.

- **Primary colors:** #6c47ff (vibrant purple), #1a1a2e (near-black), #ffffff (white)
- **Visual style:** Minimal, modern, generous whitespace, product-forward
- **Tone of voice:** Friendly, direct, slightly playful -- avoids corporate speak
- **Key brand elements:** Pill-shaped CTAs, Inter font family, product UI as hero visual, light backgrounds`,

    doingWell: `**1. Crystal-clear value proposition**
Tally's homepage headline "The simplest way to create forms" is immediately understandable. No jargon, no ambiguity. A visitor knows within 2 seconds what Tally does and why it might be better than alternatives.

**2. Strong free-tier positioning**
"Free forever" is prominently featured and creates a genuine low-friction entry point. This is a real competitive advantage -- Typeform's free tier is heavily limited, and Jotform gates features aggressively.

**3. Product-as-hero visual approach**
Current ads lead with product UI screenshots rather than generic stock imagery. This is the right approach -- it builds credibility and lets the product sell itself.

**4. Clean, on-brand creative consistency**
All current ads maintain consistent visual language: purple accents, white backgrounds, Inter typography. This builds brand recognition across touchpoints.`,

    notWorking: `**1. All ads target the same awareness stage**
What we found: Every current ad assumes the viewer is already Solution Aware or Product Aware ("Create forms in seconds", "Tired of clunky form builders?"). There is zero Problem Aware or Unaware content.
Why it matters: You're only competing for customers who already know they need a form builder. The much larger audience -- people struggling with manual data collection, messy spreadsheets, or email-based workflows -- never sees a reason to consider Tally.
What competitors do instead: Typeform runs "Stop losing leads to boring forms" which targets the Problem Aware stage (leads being lost = the problem).

**2. Weak proof and social validation**
What we found: Current ads mention "Free forever" but include zero social proof -- no user counts, no testimonials, no brand logos, no performance metrics.
Why it matters: Without proof, the "simplest way" claim is just a claim. Jotform leads with "trusted by 25M+ users" which immediately establishes credibility.
What competitors do instead: Jotform leads with "25M+ users" and "10,000+ templates" -- concrete numbers that build trust before the viewer even tries the product.

**3. No competitive differentiation in ad copy**
What we found: Ads say "simplest" and "no coding required" but these are table-stakes claims every form builder makes. Nothing in the current creative explains why Tally specifically is different.
Why it matters: When a Solution Aware viewer sees both Tally and Typeform ads, there's no compelling reason to choose Tally. The copy doesn't address what makes Tally unique (Notion-like interface, unlimited forms on free tier, etc.).`,

    competitorWins: `**Typeform**
- Runs "conversational approach gets 3x more completions" -- a specific, quantified benefit claim that Tally lacks entirely
- Positions around outcomes (more completions, more leads) rather than features (create forms)

**Jotform**
- Leads with massive social proof: "25M+ users worldwide" establishes instant credibility
- Template count (10,000+) creates perception of comprehensiveness and reduces effort-to-value

**Google Forms**
- Not running Meta ads, which means they rely entirely on organic/product-led growth. This is actually an opportunity for Tally -- Google Forms users who want something better have no ads pushing them toward alternatives.`,

    missingOpportunities: `1. **Creator/freelancer angle**: Tally's free tier and clean UI make it perfect for freelancers, creators, and solopreneurs who need to collect payments, run surveys, or take bookings. Zero current creative targets this segment.

2. **Notion-like positioning**: Tally's editor works like Notion (slash commands, blocks). This is a genuine differentiator that resonates with the productivity-tool audience. Not mentioned anywhere in current ads.

3. **Migration/switching content**: No ads address "switching from Typeform" or "why people leave Google Forms." These high-intent keywords represent easy wins for Product Aware audiences.

4. **Use-case specific creative**: Generic "create forms" ads compete with everyone. Specific use-case ads ("collect customer feedback," "run a quiz," "accept payments with a form") would capture niche audiences with much higher intent.`,

    awarenessStageAnalysis: `| Stage | Current Coverage | Assessment |
|-------|-----------------|------------|
| Most Aware | None | No retargeting or offer-based creative for warm audiences |
| Product Aware | Moderate | "Tired of clunky form builders" assumes product awareness but lacks proof to close |
| Solution Aware | Moderate | "Create forms in seconds" targets active shoppers but doesn't differentiate |
| Problem Aware | None | Zero content addressing the upstream problem (messy data collection, lost leads) |
| Unaware | None | Zero content creating the problem for people who don't know they need a form builder |

**Primary gap:** Problem Aware and Unaware stages are completely unaddressed. This is the biggest missed opportunity.

**Funnel diagnosis:** Tally is struggling with top-of-funnel awareness, not bottom-of-funnel conversion. The product is good enough to convert once people try it (strong free tier). The problem is reaching people who don't yet know they need a better form solution. Concentrate new creative at Problem Aware and Unaware stages.`,

    recommendedConcepts: `**Allocation rationale:** Tally's funnel gap is at the top -- Problem Aware and Unaware stages are completely empty. We're concentrating 4 of 5 concepts on these stages to build awareness and create demand, with 1 concept strengthening the Product Aware stage with proof.

---

### Concept 1: The Spreadsheet Graveyard

- **Awareness stage:** Problem Aware
- **Angle:** Your data collection workflow is costing you time and leads
- **Hook direction:** "You're still copy-pasting form responses into spreadsheets?"
- **Proof style:** Before/after comparison (manual workflow vs. automated)
- **Why this concept:** The diagnosis shows zero Problem Aware content. This concept targets people who don't know their current workflow is the problem. It reframes "I need a form builder" as "I need to stop wasting 5 hours/week on manual data entry."
- **What it looks like:** Split-screen ad. Left side: messy spreadsheet with highlighted cells, manual copy-paste arrows, time stamps showing hours wasted. Right side: clean Tally dashboard with automatic responses flowing in. Headline: "Stop copy-pasting. Start collecting." Purple CTA button.

---

### Concept 2: The Notion Generation

- **Awareness stage:** Unaware
- **Angle:** If you love Notion, you'll love how Tally works
- **Hook direction:** "The form builder that works like Notion"
- **Proof style:** Product demonstration (show the slash-command interface)
- **Why this concept:** Tally's Notion-like editor is its most unique differentiator, currently unused in any creative. This targets the massive Notion user base who would instantly understand and value this UX pattern. It creates awareness among people who weren't looking for a form builder.
- **What it looks like:** Screen recording or product screenshot showing Tally's editor with slash commands visible. Clean, minimal design matching Notion's aesthetic. Headline: "Type / to create anything." Subtle Notion comparison without being derivative.

---

### Concept 3: The 25M Alternative

- **Awareness stage:** Product Aware
- **Angle:** More users are switching from Typeform and Jotform to Tally
- **Hook direction:** "Why 100,000+ users switched to Tally"
- **Proof style:** Social proof + competitive comparison
- **Why this concept:** Jotform leads with "25M users" and Typeform leads with "3x completions." Tally's current ads have zero social proof. This concept fights back with switching momentum and specific feature comparisons.
- **What it looks like:** Clean comparison card showing Tally vs. Typeform vs. Jotform: price (free vs $25/mo), forms limit (unlimited vs. 10), features. Real user quote if available. Headline: "Same power. Actually free."

---

### Concept 4: The Use-Case Hook

- **Awareness stage:** Problem Aware
- **Angle:** Stop using email for things a form can do in 30 seconds
- **Hook direction:** "Still collecting feedback via email?"
- **Proof style:** Specific use-case demonstration
- **Why this concept:** Generic "create forms" competes with everyone. Specific use-cases (feedback collection, event registration, payment forms) capture audiences who don't think of themselves as "needing a form builder" but do need to solve a specific problem.
- **What it looks like:** Series of 3-4 variants, each targeting one use case. Each shows the specific template in Tally's UI. Headlines: "Collect customer feedback in 2 minutes" / "Accept payments without a website" / "Run a quiz your audience actually finishes."`,

    testPlan: `**Test first:** Concept 1 (The Spreadsheet Graveyard) -- Highest confidence because it addresses the biggest gap (zero Problem Aware creative) with a universally relatable pain point. Every business deals with messy data collection. This concept has the widest potential audience.

**Test second:** Concept 2 (The Notion Generation) -- This is Tally's most unique angle and targets a large, engaged audience (Notion users) who are predisposed to love Tally's UX. High differentiation potential.

**Test later:** Concept 3 (The 25M Alternative) -- Only test this after building some brand awareness with Concepts 1 and 2. Competitive comparison works best when people already have some familiarity with your brand.

**What NOT to test right now:** Don't create more "create forms easily" generic ads. You already have this angle covered and it puts you in direct feature-comparison with better-funded competitors (Typeform, Jotform). Don't test Most Aware retargeting creative until you've built a larger top-of-funnel audience to retarget.`,

    raw: "",
  },
  createdAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
};

const MOCK_PROGRESS_STEPS: Array<{
  at: number;
  status: JobStatus;
  step: string;
  detail: string;
  agent?: string;
}> = [
  {
    at: 0,
    status: "scraping-website",
    step: "Scanning website",
    detail: "Capturing screenshot and reading https://tally.so...",
  },
  {
    at: 8,
    status: "extracting-brand",
    step: "Website scanned",
    detail: "Captured screenshot and extracted 4521 characters",
  },
  {
    at: 14,
    status: "scraping-ads",
    step: "Brand extracted",
    detail: "Found primary color #6c47ff, font Inter",
  },
  {
    at: 20,
    status: "scraping-competitor-ads",
    step: "Ads found",
    detail: "Found 3 active ads",
  },
  {
    at: 28,
    status: "voc-research",
    step: "Competitors scanned",
    detail: "Typeform, Jotform, and Google Forms benchmarked",
  },
  {
    at: 38,
    status: "analyzing",
    step: "Researcher",
    detail: "VoC QA pass (attempt 1, score 8.2)",
    agent: "researcher",
  },
  {
    at: 50,
    status: "concept-architecting",
    step: "Strategist",
    detail: "Diagnosis QA pass (attempt 1, score 8.4)",
    agent: "strategist",
  },
  {
    at: 62,
    status: "complete",
    step: "Concepts ready",
    detail: "4 concepts across 3 awareness stages",
    agent: "creative-director",
  },
];

export function isMockProgressJob(id: string): boolean {
  return /^mock-progress-\d+$/.test(id);
}

export function makeMockProgressJob(id: string, now = Date.now()): Job {
  const startedAt = Number(id.replace("mock-progress-", ""));
  const elapsedSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const visible = MOCK_PROGRESS_STEPS.filter((p) => p.at <= elapsedSeconds);
  const latest = visible.at(-1) || MOCK_PROGRESS_STEPS[0];
  const progress: ProgressStep[] = visible.map((p) => ({
    step: p.step,
    detail: p.detail,
    agent: p.agent,
    timestamp: new Date(startedAt + p.at * 1000).toISOString(),
  }));

  if (latest.status === "complete") {
    return {
      ...MOCK_JOB,
      id,
      progress,
      createdAt: new Date(startedAt).toISOString(),
      completedAt: new Date(startedAt + latest.at * 1000).toISOString(),
    };
  }

  return {
    id,
    status: latest.status,
    input: MOCK_JOB.input,
    progress,
    createdAt: new Date(startedAt).toISOString(),
  };
}
