/**
 * GET /api/style-references/status
 *
 * Lightweight check used by the onboarding flow to know whether the
 * signed-in user has already done the style quiz. Returns the row count
 * for their brand. The analyze page reads this to decide whether to
 * surface the "teach us your style" CTA before letting them generate.
 */
import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: brand } = await admin
      .from("brands")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    const brandRow = brand as { id: string } | null;

    if (!brandRow) {
      return NextResponse.json({ count: 0, hasBrand: false });
    }

    const { count, error } = await admin
      .from("style_references")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brandRow.id);

    if (error) {
      console.error("[style-status] count failed:", error);
      return NextResponse.json({ count: 0, hasBrand: true });
    }

    return NextResponse.json({ count: count ?? 0, hasBrand: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Status failed" },
      { status: 500 },
    );
  }
}
