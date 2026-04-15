import Anthropic from "@anthropic-ai/sdk";
import type { DiagnosisResult, BrandProfile, AdScreenshot, CompetitorData } from "../types";
import {
  buildDiagnosisPrompt,
  buildCategoryPrompt,
  buildCompetitorSuggestionPrompt,
  buildBrandDosAndDontsPrompt,
} from "./prompts";

const client = new Anthropic();

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
    model: "claude-sonnet-4-20250514",
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
  // Step 1: Categorize the business
  const categoryPrompt = buildCategoryPrompt(
    companyName,
    companyUrl,
    websiteContent
  );
  const categoryMessage = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 50,
    messages: [{ role: "user", content: categoryPrompt }],
  });
  const category =
    categoryMessage.content[0].type === "text"
      ? categoryMessage.content[0].text.trim().replace(/^["']|["']$/g, "")
      : "";

  if (!category) return [];

  // Step 2: Find top competitors in that category
  const competitorsPrompt = buildCompetitorSuggestionPrompt(
    companyName,
    category
  );
  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
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
    model: "claude-sonnet-4-20250514",
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
