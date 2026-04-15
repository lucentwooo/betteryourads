"use client";

import { Card, CardContent } from "@/components/ui/card";

export function TldrSection({ tldr }: { tldr: string }) {
  // Parse bullet points from the raw text
  const bullets = tldr
    .split("\n")
    .map((l) => l.trim())
    // Only bullets that start with - or * AND have actual content after
    .filter((l) => /^[-*]\s+\S/.test(l))
    // Skip separator-only lines like "---"
    .filter((l) => !/^[-*]{2,}$/.test(l))
    .map((l) => l.replace(/^[-*]\s*/, "").replace(/\*\*/g, "").trim())
    .filter((l) => l.length > 0);

  return (
    <Card className="border-2 border-primary bg-primary/5">
      <CardContent className="pt-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-2 py-1 rounded">
            TL;DR
          </span>
          <span className="text-sm text-muted-foreground">
            Read this in 10 seconds
          </span>
        </div>
        <ul className="space-y-3">
          {bullets.map((bullet, i) => (
            <li key={i} className="flex gap-3 text-lg font-medium leading-snug">
              <span className="text-primary flex-shrink-0 font-bold">
                {i + 1}.
              </span>
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
