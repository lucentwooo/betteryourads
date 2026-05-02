import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { addProgress, createJob, setStatus } from "@/lib/jobs/manager";
import { runNextStage } from "@/lib/jobs/pipeline";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AnalysisInput } from "@/lib/types";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const body = await request.json();
    const { companyName, companyUrl, competitors, businessType, ...rest } = body;

    if (!companyName || !companyUrl) {
      return NextResponse.json(
        { error: "Company name and URL are required" },
        { status: 400 },
      );
    }

    const url = companyUrl.startsWith("http")
      ? companyUrl
      : `https://${companyUrl}`;

    // Upsert the user's brand row. v1 = one brand per user (unique on user_id),
    // so onConflict 'user_id' lets a re-run update the same row instead of erroring.
    const admin = createAdminClient();
    const { data: brand, error: brandErr } = await admin
      .from("brands")
      .upsert(
        {
          user_id: user.id,
          name: companyName,
          url,
          business_type: businessType ?? null,
        },
        { onConflict: "user_id" },
      )
      .select("id, facebook_page_id, facebook_username")
      .single();

    if (brandErr || !brand) {
      console.error("Brand upsert failed:", brandErr);
      return NextResponse.json(
        { error: "Couldn't save your brand. Try again." },
        { status: 500 },
      );
    }

    const input: AnalysisInput = {
      companyName,
      companyUrl: url,
      competitors: competitors || [],
      brandId: brand.id as string,
      // If the user verified their FB page during onboarding, the scraper
      // will skip its discovery pass and save us one Apify call per scrape.
      knownPageId: (brand.facebook_page_id as string | null) ?? undefined,
      knownPageName: (brand.facebook_username as string | null) ?? undefined,
      ...rest,
    };

    const job = await createJob(input);

    // Reports row gets created up-front so the diagnosis run is visible in
    // Supabase even before the pipeline finishes. finalizeJobToSupabase
    // updates this same row with diagnosis + concepts on completion.
    await admin.from("reports").insert({
      brand_id: brand.id,
      job_id: job.id,
    });

    await setStatus(job.id, "scraping-website");
    await addProgress(job.id, "Scanning website", "Starting deployed scanner...");

    waitUntil(
      runNextStage(job.id).catch(async (err) => {
        const msg = err instanceof Error ? err.message : "Pipeline failed";
        console.error(`Initial pipeline stage failed for ${job.id}:`, err);
        await setStatus(job.id, "error");
        await addProgress(job.id, "Error", msg);
      }),
    );

    return NextResponse.json({ jobId: job.id });
  } catch (error) {
    console.error("Failed to create analysis job:", error);
    return NextResponse.json(
      { error: "Failed to start analysis" },
      { status: 500 },
    );
  }
}
