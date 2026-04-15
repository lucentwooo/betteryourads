import type { BrandProfile, AdScreenshot, CompetitorData } from "../types";

export function buildDiagnosisPrompt(params: {
  companyName: string;
  companyUrl: string;
  websiteContent: string;
  landingPageContent?: string;
  productDescription?: string;
  icpDescription?: string;
  brandProfile?: Omit<BrandProfile, "dosAndDonts">;
  companyAds?: AdScreenshot[];
  companyAdCount?: number;
  companyVideoCount?: number;
  companyImageCount?: number;
  competitors: CompetitorData[];
  notes?: string;
  adContentDescription?: string;
}): string {
  const {
    companyName,
    companyUrl,
    websiteContent,
    landingPageContent,
    productDescription,
    icpDescription,
    brandProfile,
    companyAds,
    companyAdCount,
    companyVideoCount,
    companyImageCount,
    competitors,
    notes,
    adContentDescription,
  } = params;

  // Extract just the ad caption from Meta Ad Library scrape text
  // (strip out Ad Library chrome like "Library ID", "Started running", "See ad details")
  const extractCaption = (raw: string): string => {
    if (!raw) return "";
    // Split on common Ad Library elements and keep what's likely the caption
    const lines = raw
      .split(/\n+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .filter((l) => !/^(Active|Library ID|Started running|Platforms|This ad has|Sponsored|Open Drop|See ad details|EU transparency)/i.test(l))
      .filter((l) => !/^\s*$/.test(l));
    return lines.slice(0, 6).join(" ").trim();
  };

  const totalCompanyAds = companyAdCount || 0;
  const videos = companyVideoCount || 0;
  const images = companyImageCount || 0;
  const adBreakdown = `[Ad breakdown: ${totalCompanyAds} total active ads, of which ${videos} are VIDEO ads and ${images} are IMAGE ads. We only captured the image ads for analysis below. The video ad content is not visible to us.]`;

  const companyAdsText =
    companyAds && companyAds.length > 0
      ? `${adBreakdown}\n\n` +
        companyAds
          .map(
            (ad, i) =>
              `Image ad ${i + 1} caption: "${extractCaption(ad.copyText) || "(caption not extracted)"}"`
          )
          .join("\n")
      : totalCompanyAds > 0
      ? `${adBreakdown}\nNo image ads captured -- ${videos > 0 ? "the company runs only video ads which we cannot analyze." : "captions not extracted."}`
      : "No current ads found. The company may not be running Meta ads yet.";

  const competitorText = competitors
    .map((c) => {
      const total = c.totalAdCount || 0;
      const videos = c.videoAdCount || 0;
      const adsText =
        c.ads.length > 0
          ? c.ads
              .map(
                (ad, i) =>
                  `  Image ad ${i + 1} caption: "${extractCaption(ad.copyText) || "(not extracted)"}"`
              )
              .join("\n")
          : "  No image ads captured";
      return `**${c.name}** (${total} total active ads, ${videos} video, ${total - videos} image)\nWebsite: ${c.websiteContent || "Not available"}\n${adsText}`;
    })
    .join("\n\n");

  const brandText = brandProfile
    ? `
Auto-detected brand profile:
- Primary color: ${brandProfile.colors.primary}
- Secondary: ${brandProfile.colors.secondary}
- Accent: ${brandProfile.colors.accent}
- Background: ${brandProfile.colors.background}
- Text color: ${brandProfile.colors.text}
- Primary font: ${brandProfile.typography.primary}
${brandProfile.typography.secondary ? `- Secondary font: ${brandProfile.typography.secondary}` : ""}
- Visual style: ${brandProfile.visualStyle.aesthetic}
- Mode: ${brandProfile.visualStyle.mode}
- CTA style: ${brandProfile.visualStyle.ctaShape}
- Corners: ${brandProfile.visualStyle.corners}
`
    : "Brand profile not available";

  return `You are a senior Meta advertising strategist who specializes in helping founder-led SaaS companies diagnose what's broken in their Meta ad strategy and decide what to test next.

You follow a structured diagnosis framework based on Eugene Schwartz's five stages of awareness:
1. Unaware -- prospect doesn't know they have a problem
2. Problem Aware -- knows the pain but not that solutions exist
3. Solution Aware -- knows solutions exist but hasn't chosen one
4. Product Aware -- knows this specific product but hasn't purchased
5. Most Aware -- knows the product, trusts claims, ready to buy

Your job is to analyze the company's current positioning, messaging, landing page, competitor landscape, and (if available) their current ad creatives -- then produce a structured Creative Opportunity Analysis.

---

IMPORTANT RULES:

1. Be SPECIFIC. Every observation must reference something you actually saw in the inputs. Never say "your messaging could be stronger" without saying exactly what's weak and what it should say instead. Cite specific copy, specific competitor examples, specific page sections.

2. Be HONEST. If something is genuinely good, say so. If something is bad, say so directly. No hedging with "consider" or "you might want to" -- state what the issue is and why it matters.

3. Follow first principles. If they're struggling with conversion, that's likely bottom-of-funnel -- meaning they need more Most Aware and Product Aware stage creative. If they're struggling with reach/awareness, that's top-of-funnel -- Problem Aware and Unaware stage creative. Map every recommendation to a specific awareness stage.

4. Concept allocation is strategic, not random. Based on the diagnosis, allocate concepts where they'll have the most impact. Don't spread evenly across all stages -- concentrate where the biggest gaps are.

5. Fewer strong concepts beat many weak ones. Recommend 3-6 concepts maximum. Each must be tied to one awareness stage, one angle, one proof style.

6. Tie everything to competitive context. Don't just say what's wrong -- show what competitors are doing better and what that means for the company's strategy. Before recommending a pivot or new positioning, THINK about who else occupies that space. If you recommend they pivot to meeting assistance, name the competitors there too (e.g., Fathom, Otter, Fireflies) -- don't assume a pivot is a "blue ocean" without considering the full competitive landscape.

7. ACCOUNT FOR VIDEO LIMITATION. Most Meta ads are video creatives. You only see the static caption above the video, NOT the video content itself. The video likely contains the real hook, emotional story, and proof. When analyzing ads:
   - Do NOT conclude "all ads say the same thing" based only on captions -- the videos may be wildly different
   - Do NOT assume ads are weak just because captions are short (captions above video are meant to tease, not tell)
   - If all captions seem similar, ACKNOWLEDGE that "the real differentiation likely lives in the video content, which we can't see from this analysis"
   - Focus analysis on: what captions CAN tell you (CTA, audience, framing, hooks), NOT on creative quality you can't verify

8. ACCOUNT FOR AD VOLUME. If a company runs 30+ ads but captions look similar, they're likely doing heavy A/B testing with video variants. This is usually a SIGN OF SOPHISTICATION, not a weakness. Don't call it "all ads look the same" -- call it "high volume of video creative variants, text hooks overlap." Big difference.

---

INPUTS:

Company: ${companyName}
Website: ${companyUrl}
Product: ${productDescription || "Not provided -- infer from website content"}
ICP: ${icpDescription || "Not provided -- infer from website content"}

${brandText}

Competitors:
${competitorText || "No competitor data provided"}

Website content:
"""
${websiteContent.slice(0, 5000)}
"""

${
  landingPageContent
    ? `Landing page content:
"""
${landingPageContent.slice(0, 3000)}
"""`
    : ""
}

Current Meta ads (describe what you see):
"""
${companyAdsText}
"""

${
  adContentDescription
    ? `Founder's description of their VIDEO ad content (USE THIS -- it's the real creative we can't see):
"""
${adContentDescription}
"""

`
    : ""
}Additional context from the founder:
"""
${notes || "None provided"}
"""

---

OUTPUT FORMAT:

Produce the analysis in the following exact structure. Use markdown formatting.

---

# Creative Opportunity Analysis: ${companyName}

*Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}*

---

## TL;DR

[Write 3-5 super simple bullet points that anyone can understand in 10 seconds. Caveman language. No jargon. Each bullet is max 10 words.

CRITICAL: Use the ACTUAL TOTAL ad count (stated above), not the number of captured ads. If the company runs 35 ads but we captured 4, say "35 ads" not "4 ads".

Use caption text CAREFULLY. Remember most ads are video -- you cannot confirm "they all say X" from captions alone. Prefer framings like "most captions focus on X" rather than absolute claims.

Example style:
- You run 35 ads. Most push the interview angle.
- Meeting market (Fathom, Otter) is crowded too.
- Your videos probably rule. Text captions are thin.
- Website says meetings but ads say interviews.]

---

## Executive Summary

[2-3 sentences. What is the single biggest strategic issue, and what should they do about it? Be direct.]

---

## Brand Profile

[Brief summary of what we detected about their brand: primary colors, visual style, tone of voice, key brand elements. This is what we'd use to keep generated creatives on-brand.]

- **Primary colors:** [hex codes or descriptions]
- **Visual style:** [minimal, bold, playful, corporate, etc.]
- **Tone of voice:** [casual, professional, technical, friendly, etc.]
- **Key brand elements:** [logo style, imagery patterns, etc.]

### Brand Do's and Don'ts

**Do:**
- [Specific brand guideline based on what we observed]
- [Another do]
- [Another do]

**Don't:**
- [Specific anti-pattern for this brand]
- [Another don't]
- [Another don't]

---

## 1. What You're Doing Well

[List 2-4 genuine strengths with specific evidence from the inputs. Each strength should reference a specific thing you observed -- a headline, a proof point, a positioning choice, a landing page element.]

---

## 2. What's Not Working

[List 3-5 specific weaknesses. For each one:]

**[Weakness name]**
What we found: [specific observation with evidence]
Why it matters: [impact on ad performance]
What competitors do instead: [specific competitor comparison if applicable]

---

## 3. What Competitors Are Doing Better

[For each major competitor, identify 1-2 things they're doing that this company is not. Be specific -- reference actual messaging, positioning, proof, or creative approaches.]

---

## 4. Missing Opportunities

[List 2-4 things the company could credibly do that they're currently ignoring entirely. These should be actionable, not vague.]

---

## 5. Awareness Stage Analysis

[For each of Schwartz's 5 stages, assess how well the company is currently covering it:]

| Stage | Current Coverage | Assessment |
|-------|-----------------|------------|
| Most Aware | [None / Weak / Moderate / Strong] | [1 sentence why] |
| Product Aware | [None / Weak / Moderate / Strong] | [1 sentence why] |
| Solution Aware | [None / Weak / Moderate / Strong] | [1 sentence why] |
| Problem Aware | [None / Weak / Moderate / Strong] | [1 sentence why] |
| Unaware | [None / Weak / Moderate / Strong] | [1 sentence why] |

**Primary gap:** [Which stage(s) need the most attention and why]

**Funnel diagnosis:** [Are they struggling with awareness, consideration, or conversion? What does that mean for where to focus?]

---

## 6. Recommended Next-Test Concepts

Based on the diagnosis above, here are the highest-priority concepts to test next. Concepts are allocated strategically -- concentrated where the biggest gaps are.

**Allocation rationale:** [1-2 sentences explaining why concepts are distributed this way.]

---

### Concept 1: [Concept Name]

- **Awareness stage:** [Which stage]
- **Angle:** [The core angle in one sentence]
- **Hook direction:** [What the opening hook should communicate]
- **Proof style:** [What type of proof to lead with -- social proof, data, testimonial, comparison, demonstration]
- **Why this concept:** [2-3 sentences explaining why this specific concept addresses a gap identified in the diagnosis. Reference the specific weakness or opportunity it targets.]
- **What it looks like:** [Brief description of what the ad creative would look like -- imagery, layout, tone]

---

### Concept 2: [Concept Name]

[Same structure as above]

---

### Concept 3: [Concept Name]

[Same structure as above]

---

[Add Concepts 4-6 if warranted. Do NOT add concepts just to fill space. Only recommend what the diagnosis actually supports.]

---

## 7. Suggested Test Plan

**Test first:** [Which concept and why -- this should be the highest-confidence recommendation]

**Test second:** [Which concept and why]

**Test later:** [Any remaining concepts and when they become relevant]

**What NOT to test right now:** [If there are obvious things the company might try that would be a waste -- call them out and explain why]

---

*This analysis was generated by BetterYourAds, an AI-native Meta diagnosis system for founder-led software companies.*`;
}

export function buildCategoryPrompt(
  companyName: string,
  companyUrl: string,
  websiteContent: string
): string {
  return `Based on this company's website, identify what CATEGORY of product this is in 3-7 words.

Company: ${companyName}
URL: ${companyUrl}
Website content: "${websiteContent.slice(0, 2000)}"

The category should be the search phrase someone would Google to find this type of product.

Examples:
- Tally -> "online form builder"
- Cluely -> "AI interview assistant"
- Fathom -> "AI meeting notes app"
- Notion -> "all-in-one workspace app"
- Attio -> "CRM for startups"

Return ONLY the category phrase, nothing else. No quotes, no punctuation, no extra words.`;
}

export function buildCompetitorSuggestionPrompt(
  companyName: string,
  category: string
): string {
  return `List the top 3 most popular apps/tools in the "${category}" category that are most likely running Meta (Facebook/Instagram) ads.

The company we are researching is ${companyName} -- DO NOT include them in the list.

Requirements:
- Must be well-known brands with distinctive names (not generic or obscure)
- Likely running Meta/Instagram ads (consumer or SMB focus)
- Return names exactly as they appear on their Facebook Page

Think: if someone Googled "best ${category}" or "top ${category}", which 3 brands would dominate the results (excluding ${companyName})?

Return ONLY a JSON array with no other text or markdown:
[{"name": "Exact Brand Name", "searchTerm": "Exact Brand Name"}]`;
}

export function buildBrandDosAndDontsPrompt(
  brandProfile: Omit<BrandProfile, "dosAndDonts">,
  websiteContent: string
): string {
  return `Based on this brand profile extracted from a company's website, generate specific brand guidelines (do's and don'ts) for creating Meta ad creatives that stay on-brand.

Brand Profile:
- Primary color: ${brandProfile.colors.primary}
- Secondary: ${brandProfile.colors.secondary}
- Accent: ${brandProfile.colors.accent}
- Background: ${brandProfile.colors.background}
- Text: ${brandProfile.colors.text}
- Primary font: ${brandProfile.typography.primary}
${brandProfile.typography.secondary ? `- Secondary font: ${brandProfile.typography.secondary}` : ""}
- Visual mode: ${brandProfile.visualStyle.mode}
- Aesthetic: ${brandProfile.visualStyle.aesthetic}
- Corner style: ${brandProfile.visualStyle.corners}
- CTA style: ${brandProfile.visualStyle.ctaShape}

Website tone sample:
"${websiteContent.slice(0, 1000)}"

Return ONLY a JSON object with no other text:
{"do": ["guideline 1", "guideline 2", "guideline 3", "guideline 4"], "dont": ["anti-pattern 1", "anti-pattern 2", "anti-pattern 3", "anti-pattern 4"]}`;
}
