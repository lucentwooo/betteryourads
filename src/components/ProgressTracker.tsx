"use client";

import type { ProgressStep, JobStatus } from "@/lib/types";

const STEP_LABELS: Record<string, string> = {
  "scraping-website": "Scanning website",
  "extracting-brand": "Extracting brand identity",
  "scraping-ads": "Pulling ads from Meta Ad Library",
  "scraping-competitor-ads": "Researching competitor ads",
  "suggesting-competitors": "Finding competitors",
  analyzing: "Running AI diagnosis",
  complete: "Analysis complete",
  error: "Something went wrong",
};

export function ProgressTracker({
  status,
  progress,
  error,
}: {
  status: JobStatus;
  progress: ProgressStep[];
  error?: string;
}) {
  const steps = [
    "scraping-website",
    "extracting-brand",
    "scraping-ads",
    "scraping-competitor-ads",
    "analyzing",
  ];

  const currentIndex = steps.indexOf(status);

  return (
    <div className="mx-auto max-w-lg py-16">
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-bold">Analyzing...</h2>
        <p className="mt-2 text-muted-foreground">
          This usually takes 1-2 minutes
        </p>
      </div>

      <div className="space-y-4">
        {steps.map((step, i) => {
          const isActive = step === status;
          const isComplete = currentIndex > i || status === "complete";
          const isPending = currentIndex < i && status !== "complete";

          return (
            <div key={step} className="flex items-start gap-3">
              <div className="mt-0.5 flex-shrink-0">
                {isComplete ? (
                  <div className="h-5 w-5 rounded-full bg-green-500 flex items-center justify-center">
                    <svg
                      className="h-3 w-3 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                ) : isActive ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                ) : (
                  <div className="h-5 w-5 rounded-full border-2 border-muted" />
                )}
              </div>
              <div>
                <p
                  className={`text-sm font-medium ${
                    isActive
                      ? "text-foreground"
                      : isComplete
                        ? "text-muted-foreground"
                        : isPending
                          ? "text-muted-foreground/50"
                          : ""
                  }`}
                >
                  {STEP_LABELS[step] || step}
                </p>
                {isActive && progress.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {progress[progress.length - 1].detail}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {status === "error" && error && (
        <div className="mt-6 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}
    </div>
  );
}
