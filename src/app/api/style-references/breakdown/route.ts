/**
 * POST /api/style-references/breakdown
 *
 * Body: { lovedCards: Array<{ key, imageUrl, source }>, originUrl?: string }
 *
 * For each loved card, runs the style-engine breakdown (vision LLM) and
 * persists the JSON to style_references under the user's brand. Returns
 * the saved row count.
 *
 * originUrl is the absolute origin (e.g. https://app.betteryourads.com)
 * so we can rewrite the relative /api/style-references/curated/... URLs
 * into absolute URLs before fetching them server-side.
 */
import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { breakdownAd } from "@/lib/style-engine/breakdown";

export const maxDuration = 300;

interface LovedCard {
  key: string;
  imageUrl: string;
  source: "curated" | "competitor" | "uploaded";
  brand?: string;
  competitor?: string;
}

interface BrandRow {
  id: string;
  name: string;
  business_type: string | null;
}

import type { StyleBreakdown } from "@/lib/style-engine/schema";

interface SuccessfulBreakdown {
  brand_id: string;
  image_url: string;
  source: "curated" | "competitor" | "uploaded";
  breakdown: StyleBreakdown;
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const body = (await request.json()) as {
      lovedCards: LovedCard[];
      originUrl?: string;
    };
    const lovedCards = (body.lovedCards ?? []).slice(0, 8);
    if (lovedCards.length === 0) {
      return NextResponse.json(
        { error: "No loved cards" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const { data: brandRaw, error: brandErr } = await admin
      .from("brands")
      .select("id, name, business_type")
      .eq("user_id", user.id)
      .maybeSingle();
    const brand = brandRaw as BrandRow | null;

    if (brandErr || !brand) {
      return NextResponse.json(
        { error: "No brand on file — finish onboarding first" },
        { status: 400 },
      );
    }

    const origin =
      body.originUrl ||
      request.headers.get("origin") ||
      `https://${request.headers.get("host") ?? "betteryourads.com"}`;

    // Run breakdowns concurrently — they're vision LLM calls, ~5–10s each.
    // Five-card cap means worst case ~50s before we reply.
    const results = await Promise.all(
      lovedCards.map(async (card) => {
        const absoluteUrl = card.imageUrl.startsWith("http")
          ? card.imageUrl
          : `${origin}${card.imageUrl}`;
        try {
          const breakdown = await breakdownAd(absoluteUrl, {
            industry: brand.business_type ?? undefined,
            brandName: card.competitor ?? card.brand,
          });
          return {
            ok: true as const,
            row: {
              brand_id: brand.id,
              image_url: card.imageUrl,
              source: card.source,
              breakdown,
            } satisfies SuccessfulBreakdown,
          };
        } catch (err) {
          console.error(`[breakdown] ${card.key} failed:`, err);
          return { ok: false as const, key: card.key };
        }
      }),
    );

    const successes = results.filter(
      (r): r is { ok: true; row: SuccessfulBreakdown } => r.ok,
    );
    const rows = successes.map((r) => r.row);

    if (rows.length > 0) {
      const { error: insertErr } = await admin.from("style_references").insert(rows);
      if (insertErr) {
        console.error("[breakdown] insert failed:", insertErr);
        return NextResponse.json(
          { error: "Couldn't save your style references" },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      saved: rows.length,
      failed: results.length - rows.length,
    });
  } catch (err) {
    console.error("[breakdown] route error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Breakdown failed" },
      { status: 500 },
    );
  }
}
