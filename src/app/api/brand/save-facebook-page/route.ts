/**
 * Save the user's verified Facebook page to their brand row. Called from
 * the onboarding "verify your FB page" step after the user picks a
 * candidate (or pastes a custom page id/URL).
 *
 * Upserts the brand row keyed on user_id, so this also bootstraps the
 * brand record if onboarding hasn't created it yet.
 */
import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const { companyName, companyUrl, businessType, pageId, pageName, pageUsername } =
      await request.json();

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
        : null;

    const admin = createAdminClient();
    const { data: brand, error } = await admin
      .from("brands")
      .upsert(
        {
          user_id: user.id,
          name: companyName,
          url,
          business_type: businessType ?? null,
          facebook_page_id: pageId ?? null,
          facebook_username: pageUsername ?? pageName ?? null,
        },
        { onConflict: "user_id" },
      )
      .select("id")
      .single();

    if (error || !brand) {
      console.error("[save-facebook-page] upsert failed:", error);
      return NextResponse.json(
        { error: "Couldn't save your page. Try again." },
        { status: 500 },
      );
    }

    return NextResponse.json({ brandId: brand.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[save-facebook-page] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
