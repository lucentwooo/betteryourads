"use client";

import type { DiagnosisResult } from "@/lib/types";
import { markdownToHtml } from "@/lib/clean-markdown";
import { AwarenessFunnel } from "@/components/AwarenessFunnel";

/* Parse markdown bullets/headings into structured items so we can render
   them editorially instead of as a wall of HTML inside a card. */
function parseBullets(src: string): { heading?: string; text: string }[] {
  if (!src) return [];
  const lines = src
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !/^[-*_]{3,}$/.test(l));

  const items: { heading?: string; text: string }[] = [];
  let current: { heading?: string; text: string } | null = null;

  for (const line of lines) {
    // Bolded "heading" on its own line, or "- **Heading**" start of a bullet
    const boldHeadMatch = line.match(/^(?:[-*]\s*)?\*\*(.+?)\*\*[:.]?\s*(.*)$/);
    if (boldHeadMatch && boldHeadMatch[1].length < 80) {
      if (current) items.push(current);
      current = {
        heading: boldHeadMatch[1].trim(),
        text: boldHeadMatch[2].replace(/\*\*/g, "").trim(),
      };
      continue;
    }

    const bulletMatch = line.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      if (current) items.push(current);
      current = { text: bulletMatch[1].replace(/\*\*/g, "").trim() };
      continue;
    }

    // Continuation
    if (current) {
      current.text = (current.text ? current.text + " " : "") + line.replace(/\*\*/g, "");
    } else {
      current = { text: line.replace(/\*\*/g, "") };
    }
  }
  if (current) items.push(current);
  return items.filter((i) => (i.text || i.heading || "").length > 0);
}

export function DiagnosisSection({
  diagnosis,
}: {
  diagnosis: DiagnosisResult;
}) {
  const working = parseBullets(diagnosis.doingWell || "");
  const notWorking = parseBullets(diagnosis.notWorking || "");
  const competitorWins = parseBullets(diagnosis.competitorWins || "");
  const missing = parseBullets(diagnosis.missingOpportunities || "");

  return (
    <div className="space-y-20">
      {/* Executive summary — massive pull quote */}
      {diagnosis.executiveSummary && (
        <div className="relative">
          <span className="absolute -left-2 -top-10 font-serif text-8xl italic leading-none text-coral/70 md:-left-6 md:text-9xl">
            “
          </span>
          <div
            className="max-w-3xl font-serif text-[clamp(1.4rem,2.6vw,2.1rem)] italic leading-[1.35] text-ink"
            dangerouslySetInnerHTML={{
              __html: markdownToHtml(diagnosis.executiveSummary),
            }}
          />
        </div>
      )}

      {/* Two-column working / not working ledger */}
      {(working.length > 0 || notWorking.length > 0) && (
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-16">
          {working.length > 0 && (
            <Column
              eyebrow="Working"
              accent="sage"
              items={working}
              glyph="+"
            />
          )}
          {notWorking.length > 0 && (
            <Column
              eyebrow="Not working"
              accent="coral"
              items={notWorking}
              glyph="−"
            />
          )}
        </div>
      )}

      {/* Competitor wins — sage callout, left border */}
      {competitorWins.length > 0 && (
        <Callout accent="sage" label="What competitors do better">
          <ul className="space-y-4">
            {competitorWins.map((it, i) => (
              <CalloutItem key={i} heading={it.heading} text={it.text} />
            ))}
          </ul>
        </Callout>
      )}

      {/* Missing opportunities — coral callout */}
      {missing.length > 0 && (
        <Callout accent="coral" label="Missing opportunities">
          <ul className="space-y-4">
            {missing.map((it, i) => (
              <CalloutItem key={i} heading={it.heading} text={it.text} />
            ))}
          </ul>
        </Callout>
      )}

      {/* Awareness funnel (already a visual) */}
      {diagnosis.awarenessStageAnalysis && (
        <div>
          <div className="eyebrow mb-5 text-ink/55">Awareness stage coverage</div>
          <AwarenessFunnel raw={diagnosis.awarenessStageAnalysis} />
        </div>
      )}
    </div>
  );
}

function Column({
  eyebrow,
  accent,
  items,
  glyph,
}: {
  eyebrow: string;
  accent: "sage" | "coral";
  items: { heading?: string; text: string }[];
  glyph: string;
}) {
  const accentText = accent === "sage" ? "text-sage" : "text-coral";
  return (
    <div>
      <div className={`eyebrow mb-5 ${accentText}`}>{eyebrow}</div>
      <ul className="divide-y divide-hairline border-t hairline">
        {items.map((it, i) => (
          <li key={i} className="grid grid-cols-[auto_1fr] items-baseline gap-4 py-5">
            <span className={`font-serif text-2xl italic leading-none ${accentText}`}>
              {glyph}
            </span>
            <div>
              {it.heading && (
                <div className="font-serif text-xl italic leading-tight text-ink">
                  {it.heading}
                </div>
              )}
              {it.text && (
                <p className="mt-1 text-[0.95rem] leading-relaxed text-ink/75">
                  {it.text}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Callout({
  accent,
  label,
  children,
}: {
  accent: "sage" | "coral";
  label: string;
  children: React.ReactNode;
}) {
  const border = accent === "sage" ? "border-sage" : "border-coral";
  const text = accent === "sage" ? "text-sage" : "text-coral";
  return (
    <div className={`border-l-[3px] pl-6 md:pl-10 ${border}`}>
      <div className={`eyebrow mb-5 ${text}`}>{label}</div>
      {children}
    </div>
  );
}

function CalloutItem({ heading, text }: { heading?: string; text: string }) {
  return (
    <li>
      {heading && (
        <span className="font-serif text-lg italic text-ink">
          {heading}
          {text && <span className="text-ink/50"> — </span>}
        </span>
      )}
      {text && <span className="text-[0.98rem] leading-relaxed text-ink/80">{text}</span>}
    </li>
  );
}
