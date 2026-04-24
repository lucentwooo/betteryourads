"use client";

import type { BrandProfile } from "@/lib/types";

function ColorSwatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <div
        className="h-16 w-16 rounded-xl border-[1.5px] border-ink/15 shadow-[3px_3px_0_-1px_var(--ink)]"
        style={{ backgroundColor: color }}
      />
      <div>
        <div className="eyebrow text-ink/55">{label}</div>
        <div className="font-mono mt-0.5 text-[0.72rem] text-ink/70">{color}</div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[auto_1fr] items-baseline gap-6 border-b hairline py-4">
      <span className="eyebrow text-ink/55">{label}</span>
      <span className="font-medium text-right text-[0.95rem] capitalize text-ink md:text-[1rem]">
        {value}
      </span>
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
    <div className="space-y-16">
      {/* Palette — big, editorial, no card chrome */}
      <div>
        <div className="eyebrow text-ink/55">Palette</div>
        <div className="mt-5 flex flex-wrap gap-8">
          <ColorSwatch color={brand.colors.primary} label="Primary" />
          <ColorSwatch color={brand.colors.secondary} label="Secondary" />
          <ColorSwatch color={brand.colors.accent} label="Accent" />
          <ColorSwatch color={brand.colors.background} label="Background" />
          <ColorSwatch color={brand.colors.text} label="Text" />
        </div>
      </div>

      {/* Typography + Visual identity — two editorial ledgers */}
      <div className="grid grid-cols-1 gap-12 md:grid-cols-2 md:gap-16">
        <div>
          <div className="eyebrow text-ink/55">Typography</div>
          <div className="mt-2 border-t hairline">
            <Row label="Primary" value={brand.typography.primary} />
            {brand.typography.secondary && (
              <Row label="Secondary" value={brand.typography.secondary} />
            )}
            <Row label="Heading weight" value={String(brand.typography.headingWeight)} />
            <Row label="Body weight" value={String(brand.typography.bodyWeight)} />
          </div>
        </div>

        <div>
          <div className="eyebrow text-ink/55">Visual identity</div>
          <div className="mt-2 border-t hairline">
            <Row label="Mode" value={brand.visualStyle.mode} />
            <Row label="Corners" value={brand.visualStyle.corners} />
            <Row label="CTA shape" value={brand.visualStyle.ctaShape} />
            <Row label="Aesthetic" value={brand.visualStyle.aesthetic} />
          </div>
        </div>
      </div>

      {/* Do's / Don'ts — matches DiagnosisSection Column pattern (sage / coral) */}
      {brand.dosAndDonts && (brand.dosAndDonts.do.length > 0 || brand.dosAndDonts.dont.length > 0) && (
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-16">
          {brand.dosAndDonts.do.length > 0 && (
            <div>
              <div className="eyebrow mb-5 text-sage">Do</div>
              <ul className="divide-y divide-hairline border-t hairline">
                {brand.dosAndDonts.do.map((item, i) => (
                  <li key={i} className="grid grid-cols-[auto_1fr] items-baseline gap-4 py-4">
                    <span className="font-serif text-xl italic leading-none text-sage">+</span>
                    <span className="text-[0.95rem] leading-relaxed text-ink/80">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {brand.dosAndDonts.dont.length > 0 && (
            <div>
              <div className="eyebrow mb-5 text-coral">Don&apos;t</div>
              <ul className="divide-y divide-hairline border-t hairline">
                {brand.dosAndDonts.dont.map((item, i) => (
                  <li key={i} className="grid grid-cols-[auto_1fr] items-baseline gap-4 py-4">
                    <span className="font-serif text-xl italic leading-none text-coral">−</span>
                    <span className="text-[0.95rem] leading-relaxed text-ink/80">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Website screenshot — framed like the hero product card */}
      {websiteScreenshot && (
        <div>
          <div className="eyebrow mb-5 text-ink/55">Live capture</div>
          <div className="overflow-hidden rounded-[1.2rem] border-[1.5px] border-ink bg-card shadow-[6px_8px_0_0_var(--ink)]">
            <div className="flex items-center gap-1.5 border-b hairline bg-paper px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-coral/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-butter" />
              <span className="h-2.5 w-2.5 rounded-full bg-sage/60" />
            </div>
            <div className="max-h-[28rem] overflow-y-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={websiteScreenshot} alt="Website screenshot" className="w-full" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
