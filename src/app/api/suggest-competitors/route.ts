import { NextResponse } from "next/server";
import { suggestCompetitors } from "@/lib/ai/diagnosis";
import { scrapeWebsite } from "@/lib/scraper/website-scraper";
import path from "path";
import fs from "fs/promises";

export async function POST(request: Request) {
  try {
    const { companyName, companyUrl } = await request.json();

    if (!companyName || !companyUrl) {
      return NextResponse.json(
        { error: "Company name and URL are required" },
        { status: 400 }
      );
    }

    const url = companyUrl.startsWith("http")
      ? companyUrl
      : `https://${companyUrl}`;

    // Quick scrape just for text content
    const tmpDir = path.join(process.cwd(), "data", "jobs", "_temp");
    await fs.mkdir(tmpDir, { recursive: true });

    let websiteContent = "";
    try {
      const websiteResult = await scrapeWebsite(url, tmpDir);
      websiteContent = websiteResult.textContent;
    } catch (scrapeError) {
      console.error("Website scrape failed, continuing with name only:", scrapeError);
    }

    const competitors = await suggestCompetitors(
      companyName,
      url,
      websiteContent || `Company called ${companyName} at ${url}`
    );

    // Clean up temp files
    try {
      await fs.rm(tmpDir, { recursive: true });
    } catch {
      // ignore cleanup errors
    }

    return NextResponse.json({ competitors });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Failed to suggest competitors:", errorMessage);

    // Return the error message so the frontend can show it
    return NextResponse.json(
      {
        error: errorMessage.includes("credit balance")
          ? "API credits are too low. Add credits at console.anthropic.com"
          : `Failed to suggest competitors: ${errorMessage}`,
        competitors: [],
      },
      { status: 200 } // Return 200 so frontend can still show the competitor input
    );
  }
}
