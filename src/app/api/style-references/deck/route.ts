/**
 * GET /api/style-references/deck
 *
 * Returns the shuffled style-quiz deck for the signed-in user. Mixes
 * curated reference ads with the user's scraped competitor ads (if any).
 * Up to 18 cards per deck.
 */
import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildDeck } from "@/lib/style-library/mixer";

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

    const cards = await buildDeck({ brandId: (brand as { id: string } | null)?.id });
    return NextResponse.json({ cards });
  } catch (err) {
    console.error("[deck] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Deck failed" },
      { status: 500 },
    );
  }
}
