"use client";

import { Card, CardContent } from "@/components/ui/card";

interface StageRow {
  stage: string;
  coverage: "None" | "Weak" | "Moderate" | "Strong" | string;
  assessment: string;
}

function parseStages(raw: string): StageRow[] {
  // Find markdown table rows that contain a stage name
  const stageNames = [
    "Most Aware",
    "Product Aware",
    "Solution Aware",
    "Problem Aware",
    "Unaware",
  ];

  const rows: StageRow[] = [];
  for (const name of stageNames) {
    // Match a table row containing this stage name
    const pattern = new RegExp(
      `\\|\\s*${name}\\s*\\|\\s*([^|]+?)\\s*\\|\\s*([^|\\n]+?)\\s*\\|`,
      "i"
    );
    const match = raw.match(pattern);
    if (match) {
      rows.push({
        stage: name,
        coverage: match[1].trim().replace(/\*+/g, ""),
        assessment: match[2].trim().replace(/\*+/g, ""),
      });
    }
  }

  return rows;
}

const COVERAGE_STYLES: Record<string, { width: string; color: string; textColor: string }> = {
  none: { width: "0%", color: "bg-red-200", textColor: "text-red-700" },
  weak: { width: "25%", color: "bg-orange-300", textColor: "text-orange-700" },
  moderate: { width: "60%", color: "bg-amber-400", textColor: "text-amber-700" },
  strong: { width: "100%", color: "bg-green-500", textColor: "text-green-700" },
};

export function AwarenessFunnel({ raw }: { raw: string }) {
  const stages = parseStages(raw);
  if (stages.length === 0) return null;

  // Extract primary gap and funnel diagnosis lines
  const primaryGap = raw.match(/Primary gap:\s*\*?\*?(.+?)(?:\n|$)/i)?.[1] || "";
  const funnelDiagnosis =
    raw.match(/Funnel diagnosis:\s*\*?\*?(.+?)(?:\n|$)/i)?.[1] || "";

  return (
    <Card>
      <CardContent className="pt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          Awareness Stage Coverage
        </h3>

        <div className="space-y-3">
          {stages.map((row) => {
            const key = row.coverage.toLowerCase().split(/[\s/]/)[0];
            const style = COVERAGE_STYLES[key] || COVERAGE_STYLES.none;

            return (
              <div key={row.stage} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{row.stage}</span>
                  <span
                    className={`text-xs font-semibold uppercase tracking-wider ${style.textColor}`}
                  >
                    {row.coverage}
                  </span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${style.color} transition-all`}
                    style={{ width: style.width }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {row.assessment.replace(/\*+/g, "")}
                </p>
              </div>
            );
          })}
        </div>

        {(primaryGap || funnelDiagnosis) && (
          <div className="mt-6 pt-4 border-t space-y-2">
            {primaryGap && (
              <div className="text-sm">
                <span className="font-semibold">Primary gap: </span>
                <span className="text-muted-foreground">
                  {primaryGap.replace(/\*+/g, "").trim()}
                </span>
              </div>
            )}
            {funnelDiagnosis && (
              <div className="text-sm">
                <span className="font-semibold">Funnel diagnosis: </span>
                <span className="text-muted-foreground">
                  {funnelDiagnosis.replace(/\*+/g, "").trim()}
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
