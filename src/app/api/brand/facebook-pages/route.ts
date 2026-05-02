/**
 * Find candidate Facebook pages for a brand. The user picks the right one
 * during onboarding, we save the page_id, and from then on every scrape
 * skips the discovery pass — saves money and eliminates impostor pages.
 *
 * Costs ONE Apify run per call (10-result minimum). One-time per brand.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findFacebookPageCandidates } from "@/lib/scraper/apify-meta";

export const maxDuration = 90;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const { companyName, companyUrl } = await request.json();
    if (!companyName) {
      return NextResponse.json(
        { error: "Company name is required" },
        { status: 400 },
      );
    }

    const url = companyUrl?.startsWith("http")
      ? companyUrl
      : companyUrl
        ? `https://${companyUrl}`
        : undefined;

    const { candidates, reason } = await findFacebookPageCandidates(
      companyName,
      url,
    );

    return NextResponse.json({ candidates, reason });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[facebook-pages] failed:", msg);
    return NextResponse.json(
      { candidates: [], error: msg },
      { status: 200 },
    );
  }
}
