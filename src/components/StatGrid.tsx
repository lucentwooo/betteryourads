"use client";

import type { Job } from "@/lib/types";

export function StatGrid({ job }: { job: Job }) {
  const companyAdCount = job.companyAdCount || 0;
  const videoCount = job.companyVideoCount || 0;
  const competitorCount = job.competitorData?.length || 0;
  const totalCompetitorAds =
    job.competitorData?.reduce(
      (sum, c) =>
        sum +
        Math.max(
          c.totalAdCount || 0,
          (c.videoAdCount || 0) + (c.imageAdCount || 0)
        ),
      0
    ) || 0;

  const brandColor = job.brandProfile?.colors.primary || "#1A1915";

  return (
    <dl className="grid grid-cols-2 divide-x divide-y divide-hairline border-y hairline md:grid-cols-4 md:divide-y-0">
      <Stat
        value={companyAdCount > 0 ? `${companyAdCount}` : "0"}
        label="Active ads"
        sub={videoCount > 0 ? `${videoCount} video · ${companyAdCount - videoCount} image` : undefined}
      />
      <Stat
        value={totalCompetitorAds > 0 ? `${totalCompetitorAds}` : "0"}
        label="Competitor ads"
      />
      <Stat value={`${competitorCount}`} label="Competitors" />
      <div className="flex flex-col justify-between gap-3 p-6">
        <div className="flex items-baseline gap-3">
          <span
            className="h-9 w-9 rounded-md border border-ink/15"
            style={{ backgroundColor: brandColor }}
          />
          <span className="font-mono text-sm text-ink">{brandColor}</span>
        </div>
        <span className="eyebrow text-ink/55">Brand color</span>
      </div>
    </dl>
  );
}

function Stat({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="flex flex-col justify-between gap-3 p-6">
      <div className="font-semibold text-5xl leading-none text-ink md:text-6xl">
        {value}
      </div>
      <div>
        <div className="eyebrow text-ink/55">{label}</div>
        {sub && <div className="mt-1 font-mono text-[0.7rem] text-ink/45">{sub}</div>}
      </div>
    </div>
  );
}
