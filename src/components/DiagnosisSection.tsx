"use client";

import type { DiagnosisResult } from "@/lib/types";
import { markdownToHtml } from "@/lib/clean-markdown";
import { AwarenessFunnel } from "@/components/AwarenessFunnel";

/* Parse markdown bullets/headings into structured items so we can render
   them editorially instead of as a wall of HTML inside a card. Accepts
   markdown list markers (- *) AND unicode bullet glyphs (• · ▸ ▹ ‣ –) that
   the model sometimes returns instead of real markdown. */
const BULLET_GLYPH = "[-*•·▸▹‣–—]";
const LEADING_BULLET = new RegExp(`^${BULLET_GLYPH}\\s*`);
const BULLET_LINE = new RegExp(`^${BULLET_GLYPH}\\s+(.*)$`);
const BOLD_HEAD_LINE = new RegExp(
  `^(?:${BULLET_GLYPH}\\s*)?\\*\\*(.+?)\\*\\*[:.]?\\s*(.*)$`,
);

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
    const boldHeadMatch = line.match(BOLD_HEAD_LINE);
    if (boldHeadMatch && boldHeadMatch[1].length < 80) {
      if (current) items.push(current);
      current = {
        heading: boldHeadMatch[1].trim(),
        text: boldHeadMatch[2].replace(/\*\*/g, "").trim(),
      };
      continue;
    }

    const bulletMatch = line.match(BULLET_LINE);
    if (bulletMatch) {
      if (current) items.push(current);
      current = { text: bulletMatch[1].replace(/\*\*/g, "").trim() };
      continue;
    }

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

  // Decide executive summary render mode: if the content has bullets/headings,
  // render as editorial findings; otherwise render as a pull-quote.
  const execItems = parseBullets(diagnosis.executiveSummary || "");
  const execIsStructured =
    execItems.length >= 2 &&
    (execItems.some((it) => it.heading) ||
      LEADING_BULLET.test((diagnosis.executiveSummary || "").trim()));

  return (
    <div className="space-y-20">
      {/* Executive summary */}
      {diagnosis.executiveSummary && (
        execIsStructured ? (
          <ExecutiveFindings items={execItems} />
        ) : (
          <div className="relative">
            <span
              aria-hidden
              className="font-semibold pointer-events-none absolute -left-3 -top-12 text-8xl leading-none text-coral/60 md:-left-7 md:-top-14 md:text-9xl"
            >
              “
            </span>
            <div
              className="font-semibold relative max-w-3xl text-[clamp(1.3rem,2.4vw,1.95rem)] leading-[1.35] text-ink"
              dangerouslySetInnerHTML={{
                __html: markdownToHtml(diagnosis.executiveSummary),
              }}
            />
          </div>
        )
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

function ExecutiveFindings({
  items,
}: {
  items: { heading?: string; text: string }[];
}) {
  return (
    <div className="relative">
      <div className="eyebrow mb-6 text-ink/55">The diagnosis · {items.length} findings</div>
      <ol className="max-w-4xl divide-y divide-hairline border-y hairline">
        {items.map((it, i) => (
          <li
            key={i}
            className="grid grid-cols-[auto_1fr] items-baseline gap-6 py-6 md:gap-10 md:py-8"
          >
            <span className="font-mono text-[0.72rem] uppercase tracking-[0.2em] text-coral">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              {it.heading && (
                <div className="font-semibold text-xl leading-snug text-ink md:text-2xl">
                  {it.heading}
                </div>
              )}
              {it.text && (
                <p
                  className={`${
                    it.heading ? "mt-2" : ""
                  } text-[1rem] leading-relaxed text-ink/75 md:text-[1.05rem]`}
                >
                  {it.text}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
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
                <div className="font-semibold text-xl leading-tight text-ink">
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
        <span className="font-semibold text-lg text-ink">
          {heading}
          {text && <span className="text-ink/50"> — </span>}
        </span>
      )}
      {text && <span className="text-[0.98rem] leading-relaxed text-ink/80">{text}</span>}
    </li>
  );
}
