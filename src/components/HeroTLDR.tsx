"use client";

import type { DiagnosisResult } from "@/lib/types";

const BULLET_GLYPH = "[-*•·▸▹‣–—]";
const BULLET_LINE = new RegExp(`^${BULLET_GLYPH}\\s+(.*)$`);
const BOLD_HEAD_LINE = new RegExp(
  `^(?:${BULLET_GLYPH}\\s*)?\\*\\*(.+?)\\*\\*[:.]?\\s*(.*)$`,
);

/* Parse the diagnosis executiveSummary into structured findings.
   Mirrors DiagnosisSection's parser so the hero pulls the same data. */
function parseFindings(src: string): { heading?: string; text: string }[] {
  if (!src) return [];
  const lines = src
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !/^[-*_]{3,}$/.test(l));

  const items: { heading?: string; text: string }[] = [];
  let current: { heading?: string; text: string } | null = null;

  for (const line of lines) {
    const boldHead = line.match(BOLD_HEAD_LINE);
    if (boldHead && boldHead[1].length < 80) {
      if (current) items.push(current);
      current = {
        heading: boldHead[1].trim(),
        text: boldHead[2].replace(/\*\*/g, "").trim(),
      };
      continue;
    }
    const bullet = line.match(BULLET_LINE);
    if (bullet) {
      if (current) items.push(current);
      current = { text: bullet[1].replace(/\*\*/g, "").trim() };
      continue;
    }
    if (current) {
      current.text =
        (current.text ? current.text + " " : "") + line.replace(/\*\*/g, "");
    } else {
      current = { text: line.replace(/\*\*/g, "") };
    }
  }
  if (current) items.push(current);
  return items.filter((i) => (i.text || i.heading || "").length > 0);
}

export function HeroTLDR({
  companyName,
  diagnosis,
  completedAt,
}: {
  companyName: string;
  diagnosis: DiagnosisResult;
  completedAt?: string;
}) {
  const items = parseFindings(diagnosis.executiveSummary || "");
  // If executive summary parsing yielded nothing, fall back to TLDR bullets.
  const fallback = items.length === 0 ? parseFindings(diagnosis.tldr || "") : [];
  const findings = (items.length > 0 ? items : fallback).slice(0, 3);

  // No findings → still render a hero with the company name + TLDR text.
  return (
    <section
      data-reveal
      className="relative border-b hairline"
      aria-label={`Diagnosis hero for ${companyName}`}
    >
      <div className="mx-auto max-w-6xl px-5 pt-16 pb-12 md:pt-24 md:pb-16">
        <div className="eyebrow text-ink/55">
          A diagnosis
          {completedAt
            ? ` · ${new Date(completedAt).toLocaleDateString(undefined, {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}`
            : ""}
        </div>
        <h1 className="display mt-5 max-w-4xl text-[clamp(2.25rem,5vw,4.5rem)] leading-[0.98]">
          The {findings.length || 3} things{" "}
          <span className="display-italic text-coral">{companyName}</span> gets
          wrong.
        </h1>

        {findings.length > 0 ? (
          <ol className="mt-12 grid max-w-5xl gap-0 divide-y divide-hairline border-y hairline md:grid-cols-3 md:gap-0 md:divide-x md:divide-y-0">
            {findings.map((f, i) => (
              <li
                key={i}
                className="grid grid-rows-[auto_1fr] gap-4 px-0 py-8 md:px-6 md:py-10"
              >
                <span className="font-mono text-[0.72rem] uppercase tracking-[0.22em] text-coral">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  {f.heading && (
                    <div className="font-semibold text-2xl leading-tight text-ink md:text-[1.6rem]">
                      {f.heading}
                    </div>
                  )}
                  {f.text && (
                    <p
                      className={`${
                        f.heading ? "mt-3" : ""
                      } text-[1rem] leading-relaxed text-ink/80 md:text-[1.05rem]`}
                    >
                      {f.text}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        ) : diagnosis.tldr ? (
          <p className="mt-10 max-w-3xl text-xl leading-relaxed text-ink/80 md:text-2xl">
            {diagnosis.tldr}
          </p>
        ) : null}

        <div className="mt-12 flex items-center gap-3 text-ink/45">
          <span className="font-mono text-[0.72rem] uppercase tracking-[0.22em]">
            Scroll for the plan
          </span>
          <span aria-hidden className="text-lg">↓</span>
        </div>
      </div>
    </section>
  );
}
