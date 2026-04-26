"use client";

import type { AdScreenshot } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function AdCard({ ad }: { ad: AdScreenshot; jobId: string }) {
  const imageUrl = ad.screenshotPath.includes("data/jobs/")
    ? `/api/screenshots/${ad.screenshotPath.split("data/jobs/").pop()}`
    : ad.screenshotPath;

  const isVideo = ad.adType === "video";

  return (
    <Card className="overflow-hidden">
      <div className="relative bg-muted">
        <img
          src={imageUrl}
          alt="Ad creative"
          className="w-full h-auto"
          loading="lazy"
        />
        <div className="absolute top-2 right-2 flex gap-1">
          {isVideo && (
            <Badge className="bg-red-500 text-white text-xs hover:bg-red-500">
              VIDEO
            </Badge>
          )}
          <Badge variant="secondary" className="text-xs">
            {ad.source === "meta-ad-library" ? "Ad Library" : "Uploaded"}
          </Badge>
        </div>
      </div>
      {ad.analysis && (
        <CardContent className="pt-4">
          <p className="text-sm">{ad.analysis}</p>
        </CardContent>
      )}
    </Card>
  );
}

export function AdGallery({
  title,
  subtitle,
  ads,
  jobId,
  emptyMessage,
  totalCount,
  videoCount,
}: {
  title: string;
  subtitle?: string;
  ads: AdScreenshot[];
  jobId: string;
  emptyMessage?: string;
  totalCount?: number;
  videoCount?: number;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold">{title}</h2>
          {subtitle && (
            <p className="text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
        {totalCount ? (
          <div className="text-right">
            <div className="text-2xl font-bold">{totalCount}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">
              Active ads
            </div>
          </div>
        ) : null}
      </div>
      {totalCount && totalCount > 0 && (
        <p className="text-sm text-muted-foreground">
          Showing {ads.length} of {totalCount} active ads
          {videoCount && videoCount > 0
            ? ` - ${videoCount} are video ads (we show the thumbnail, not the video)`
            : ""}
        </p>
      )}

      {ads.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ads.map((ad, i) => (
            <AdCard key={i} ad={ad} jobId={jobId} />
          ))}
        </div>
      ) : totalCount && totalCount > 0 && videoCount && videoCount > 0 ? (
        <Card className="bg-muted/30">
          <CardContent className="py-8 text-center space-y-2">
            <p className="text-base font-medium">
              All ads appear to be video
            </p>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto">
              We detected {videoCount}+ video ads running. Our scraper can identify that video ads exist via the HTML video tag, but we can&apos;t reliably screenshot video content. If you see image thumbnails on Meta Ad Library, those are the first frames of video ads.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              {emptyMessage || "No ads found"}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function CompetitorAdGallery({
  competitors,
  jobId,
}: {
  competitors: {
    name: string;
    ads: AdScreenshot[];
    totalAdCount?: number;
    videoAdCount?: number;
    imageAdCount?: number;
  }[];
  jobId: string;
}) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold">Competitor Ads</h2>
        <p className="text-muted-foreground mt-1">
          What your competitors are running on Meta
        </p>
      </div>

      {competitors.map((comp) => {
        const total = comp.totalAdCount || 0;
        const videos = comp.videoAdCount || 0;
        return (
          <div key={comp.name} className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-lg font-semibold">{comp.name}</h3>
              {total > 0 && (
                <span className="text-sm text-muted-foreground">
                  {total} active ad{total === 1 ? "" : "s"}
                </span>
              )}
            </div>
            {comp.ads.length > 0 ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Captured {comp.ads.length} image ad{comp.ads.length === 1 ? "" : "s"}
                  {videos > 0 ? ` - ${videos} video ads running but not shown` : ""}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {comp.ads.map((ad, i) => (
                    <AdCard key={i} ad={ad} jobId={jobId} />
                  ))}
                </div>
              </>
            ) : videos > 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                {comp.name} is running {videos} video ad{videos === 1 ? "" : "s"} but no image ads we could capture
              </p>
            ) : (
              <p className="text-sm text-muted-foreground py-4">
                No ads found for {comp.name} on their official Facebook Page
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
