import { NextResponse } from "next/server";
import { suggestCompetitors } from "@/lib/ai/diagnosis";
import { fetchPageText } from "@/lib/scraper/fetch-page";

// No chromium here. This endpoint just needs title + meta + a few headings
// to ask Claude for competitors — a plain HTTPS fetch is ~1-2s instead of
// 20-60s for a serverless chromium cold start.
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const { companyName, companyUrl, cheap } = await request.json();

    if (!companyName || !companyUrl) {
      return NextResponse.json(
        { error: "Company name and URL are required" },
        { status: 400 }
      );
    }

    const url = companyUrl.startsWith("http")
      ? companyUrl
      : `https://${companyUrl}`;

    let websiteContent = "";
    try {
      const { summary } = await fetchPageText(url);
      websiteContent = summary;
    } catch (scrapeError) {
      console.error(
        "[suggest-competitors] fetch failed, falling back to name only:",
        scrapeError instanceof Error ? scrapeError.message : scrapeError
      );
    }

    const competitors = await suggestCompetitors(
      companyName,
      url,
      websiteContent || `Company called ${companyName} at ${url}`,
      { cheap: Boolean(cheap) },
    );

    return NextResponse.json({ competitors });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[suggest-competitors] failed:", errorMessage);

    return NextResponse.json(
      {
        error: errorMessage.includes("credit balance")
          ? "API credits are too low. Add credits at console.anthropic.com"
          : `Failed to suggest competitors: ${errorMessage}`,
        competitors: [],
      },
      { status: 200 }
    );
  }
}
