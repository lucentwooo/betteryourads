/**
 * Competitor style library — pulls the user's scraped competitor ads from
 * Supabase. These are populated by the analyze pipeline (Apify scraper)
 * during onboarding's diagnosis step.
 *
 * Used as one of the three sources for the style quiz deck (alongside
 * curated and uploaded).
 */
import { createAdminClient } from "@/lib/supabase/admin";

export interface CompetitorCard {
  /** "competitor-{row id}" */
  key: string;
  competitor: string;
  imageUrl: string;
  copyText?: string;
}

interface CompetitorAdRow {
  id: string;
  competitor_name: string;
  image_url: string;
  copy_text: string | null;
  ad_type: "image" | "video" | null;
}

/**
 * Returns up to `limit` competitor ad cards for a brand. Image-only —
 * video ads can't be swiped meaningfully on a static thumbnail and the
 * scraped video posters tend to render poorly in the breakdown engine.
 */
export async function loadCompetitorCards(
  brandId: string,
  limit = 30,
): Promise<CompetitorCard[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("competitor_ads")
    .select("id, competitor_name, image_url, copy_text, ad_type")
    .eq("brand_id", brandId)
    .eq("ad_type", "image")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[competitor-loader] Supabase fetch failed:", error.message);
    return [];
  }

  return ((data as CompetitorAdRow[] | null) ?? [])
    .filter((r) => r.image_url)
    .map((r) => ({
      key: `competitor-${r.id}`,
      competitor: r.competitor_name,
      imageUrl: r.image_url,
      copyText: r.copy_text ?? undefined,
    }));
}
