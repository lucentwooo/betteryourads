import Anthropic from "@anthropic-ai/sdk";
import type { DiagnosisResult, BrandProfile, AdScreenshot, CompetitorData } from "../types";
import {
  buildDiagnosisPrompt,
  buildCategoryPrompt,
  buildCompetitorSuggestionPrompt,
  buildBrandDosAndDontsPrompt,
} from "./prompts";

const client = new Anthropic();

// Model tiers — route each call to the cheapest model that can do the job.
// Haiku 4.5 handles categorization / suggestion / short-format writing;
// Sonnet 4 is reserved for real reasoning tasks (full diagnosis).
const MODEL_CHEAP = "claude-haiku-4-5-20251001";
const MODEL_SMART = "claude-sonnet-4-20250514";

export async function runDiagnosis(params: {
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
}): Promise<DiagnosisResult> {
  const prompt = buildDiagnosisPrompt(params);

  const message = await client.messages.create({
    model: MODEL_CHEAP,
    max_tokens: 8000,
    messages: [{ role: "user", content: prompt }],
  });

  const raw =
    message.content[0].type === "text" ? message.content[0].text : "";

  return parseDiagnosisResponse(raw);
}

function parseDiagnosisResponse(raw: string): DiagnosisResult {
  const sections: Record<string, string> = {};
  const sectionPattern = /^##\s+(.+?)$/gm;
  const matches: { title: string; index: number }[] = [];

  let match;
  while ((match = sectionPattern.exec(raw)) !== null) {
    matches.push({ title: match[1].trim(), index: match.index });
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i].title.length + 3; // ## + space + title
    const end = i + 1 < matches.length ? matches[i + 1].index : raw.length;
    const content = raw.slice(start, end).trim();
    sections[matches[i].title.toLowerCase()] = content;
  }

  // Find sections by partial key match
  const find = (key: string): string => {
    const entry = Object.entries(sections).find(([k]) =>
      k.toLowerCase().includes(key.toLowerCase())
    );
    return entry ? entry[1] : "";
  };

  return {
    tldr: find("tl;dr") || find("tldr"),
    executiveSummary: find("executive summary"),
    brandProfile: find("brand profile"),
    doingWell: find("doing well"),
    notWorking: find("not working"),
    competitorWins: find("competitors are doing"),
    missingOpportunities: find("missing opportunit"),
    awarenessStageAnalysis: find("awareness stage"),
    recommendedConcepts: find("recommended next-test") || find("recommended concept"),
    testPlan: find("suggested test plan") || find("test plan"),
    raw,
  };
}

export async function suggestCompetitors(
  companyName: string,
  companyUrl: string,
  websiteContent: string
): Promise<{ name: string; searchTerm: string; category?: string }[]> {
  // Step 1: Categorize the business + detect locality
  const categoryPrompt = buildCategoryPrompt(
    companyName,
    companyUrl,
    websiteContent
  );
  const categoryMessage = await client.messages.create({
    model: MODEL_CHEAP,
    max_tokens: 200,
    messages: [{ role: "user", content: categoryPrompt }],
  });
  const categoryRaw =
    categoryMessage.content[0].type === "text"
      ? categoryMessage.content[0].text.trim()
      : "";

  let category = "";
  let isLocal = false;
  let city: string | null = null;
  try {
    const jsonMatch = categoryRaw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    if (parsed) {
      category = String(parsed.category || "").trim();
      isLocal = Boolean(parsed.isLocal);
      city = parsed.city ? String(parsed.city).trim() : null;
    }
  } catch {
    // Fallback: treat raw text as category string (legacy format)
    category = categoryRaw.replace(/^["']|["']$/g, "");
  }

  if (!category) return [];

  // Step 2: Find top competitors — local direct competitors if local business,
  // otherwise top category brands
  const competitorsPrompt = buildCompetitorSuggestionPrompt(
    companyName,
    category,
    isLocal,
    city
  );
  const message = await client.messages.create({
    model: MODEL_CHEAP,
    max_tokens: 500,
    messages: [{ role: "user", content: competitorsPrompt }],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "[]";

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text);
    // Attach the category so the UI can show it
    return parsed.map((c: { name: string; searchTerm: string }) => ({
      ...c,
      category,
    }));
  } catch {
    return [];
  }
}

export async function generateBrandDosAndDonts(
  brandProfile: Omit<BrandProfile, "dosAndDonts">,
  websiteContent: string
): Promise<{ do: string[]; dont: string[] }> {
  const prompt = buildBrandDosAndDontsPrompt(brandProfile, websiteContent);

  const message = await client.messages.create({
    model: MODEL_CHEAP,
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "{}";

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(text);
  } catch {
    return { do: [], dont: [] };
  }
}
