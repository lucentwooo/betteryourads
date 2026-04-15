"use client";

import type { BrandProfile } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";

function ColorSwatch({
  color,
  label,
}: {
  color: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="h-14 w-14 rounded-lg border border-border shadow-sm"
        style={{ backgroundColor: color }}
      />
      <span className="text-xs font-medium">{label}</span>
      <span className="text-xs text-muted-foreground font-mono">{color}</span>
    </div>
  );
}

export function BrandBreakdown({
  brand,
  websiteScreenshot,
}: {
  brand: BrandProfile;
  websiteScreenshot?: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Brand Breakdown</h2>
        <p className="text-muted-foreground mt-1">
          Extracted from your website
        </p>
      </div>

      {/* Color Palette */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Color Palette
          </h3>
          <div className="flex flex-wrap gap-6">
            <ColorSwatch color={brand.colors.primary} label="Primary" />
            <ColorSwatch color={brand.colors.secondary} label="Secondary" />
            <ColorSwatch color={brand.colors.accent} label="Accent" />
            <ColorSwatch color={brand.colors.background} label="Background" />
            <ColorSwatch color={brand.colors.text} label="Text" />
          </div>
        </CardContent>
      </Card>

      {/* Typography */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Typography
          </h3>
          <div className="space-y-3">
            <div>
              <span className="text-xs text-muted-foreground">
                Primary font
              </span>
              <p className="text-lg font-bold">{brand.typography.primary}</p>
            </div>
            {brand.typography.secondary && (
              <div>
                <span className="text-xs text-muted-foreground">
                  Secondary font
                </span>
                <p className="text-lg">{brand.typography.secondary}</p>
              </div>
            )}
            <div className="flex gap-6 text-sm text-muted-foreground">
              <span>Heading weight: {brand.typography.headingWeight}</span>
              <span>Body weight: {brand.typography.bodyWeight}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Visual Style */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Visual Identity
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Mode</span>
              <p className="font-medium capitalize">{brand.visualStyle.mode}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Corners</span>
              <p className="font-medium capitalize">
                {brand.visualStyle.corners}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">CTA Style</span>
              <p className="font-medium capitalize">
                {brand.visualStyle.ctaShape}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Aesthetic</span>
              <p className="font-medium capitalize">
                {brand.visualStyle.aesthetic}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Do's and Don'ts */}
      {brand.dosAndDonts && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-green-600 mb-4">
                Do
              </h3>
              <ul className="space-y-2">
                {brand.dosAndDonts.do.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="text-green-500 flex-shrink-0">+</span>
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-red-600 mb-4">
                Don&apos;t
              </h3>
              <ul className="space-y-2">
                {brand.dosAndDonts.dont.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="text-red-500 flex-shrink-0">-</span>
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Website Screenshot */}
      {websiteScreenshot && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Website Capture
            </h3>
            <div className="rounded-lg overflow-hidden border max-h-96 overflow-y-auto">
              <img
                src={websiteScreenshot}
                alt="Website screenshot"
                className="w-full"
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
