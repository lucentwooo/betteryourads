#!/usr/bin/env node
// Autonomous scraper test. Hits the deployed API for one brand,
// polls until ad-scraping is done, prints trace + asserts brand count.
//
// Usage: node scripts/test-scraper.mjs <brand-name> <brand-url> <min-count> [base-url]

const [, , brandName, brandUrl, minCountArg, baseUrlArg] = process.argv;
if (!brandName || !brandUrl || !minCountArg) {
  console.error("usage: test-scraper.mjs <name> <url> <minCount> [baseUrl]");
  process.exit(2);
}
const minCount = parseInt(minCountArg, 10);
const baseUrl =
  baseUrlArg ||
  "https://betteryourads-5orl-git-feat-pe-c6e5d5-lucents-projects-255f413a.vercel.app";

const POLL_INTERVAL_MS = 4000;
const MAX_POLL_MS = 5 * 60 * 1000;

function fmt(s) {
  return String(s).slice(0, 200).replace(/\s+/g, " ");
}

async function main() {
  console.log(`[test] brand="${brandName}" url=${brandUrl} expecting>=${minCount} active ads`);
  console.log(`[test] base=${baseUrl}`);

  const startRes = await fetch(`${baseUrl}/api/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ companyName: brandName, companyUrl: brandUrl, competitors: [] }),
  });
  if (!startRes.ok) {
    console.error(`[test] FAIL start ${startRes.status}: ${await startRes.text()}`);
    process.exit(1);
  }
  const { jobId } = await startRes.json();
  console.log(`[test] jobId=${jobId}`);
  console.log(`[test] view: ${baseUrl}/analyze/${jobId}`);

  const t0 = Date.now();
  let lastSeenSteps = 0;
  let scraperTrace = null;
  let companyAdCount = null;
  let lastStatus = "";
  let advancing = false;
  while (Date.now() - t0 < MAX_POLL_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const r = await fetch(`${baseUrl}/api/jobs/${jobId}`);
    if (!r.ok) {
      console.error(`[test] poll ${r.status}`);
      continue;
    }
    const job = await r.json();
    if (job.status !== lastStatus) {
      console.log(`[test] status: ${lastStatus || "(init)"} → ${job.status}`);
      lastStatus = job.status;
    }
    // Pipeline runs one stage per invocation; the browser normally POSTs
    // /advance after each. Replicate that. Don't double-fire while a
    // stage is mid-flight (stageRunningSince held) or already advancing.
    if (
      !advancing &&
      !job.stageRunningSince &&
      job.status !== "complete" &&
      job.status !== "error" &&
      job.status !== "awaiting-approval"
    ) {
      advancing = true;
      fetch(`${baseUrl}/api/jobs/${jobId}/advance`, { method: "POST" })
        .catch(() => {})
        .finally(() => { advancing = false; });
    }
    if (Array.isArray(job.progress) && job.progress.length > lastSeenSteps) {
      for (const step of job.progress.slice(lastSeenSteps)) {
        console.log(`[step] ${step.step}: ${fmt(step.detail)}`);
        if (step.step === "Ad scraper trace") scraperTrace = step.detail;
        if (step.step === "Ads found") {
          const m = String(step.detail).match(/^(\d+)\s+total/);
          if (m) companyAdCount = parseInt(m[1], 10);
        }
      }
      lastSeenSteps = job.progress.length;
    }
    if (typeof job.companyAdCount === "number") companyAdCount = job.companyAdCount;
    // We only care about ad-scraping. Bail once we've passed it.
    const pastAdScrape =
      job.status === "voc-research" ||
      job.status === "analyzing" ||
      job.status === "concept-architecting" ||
      job.status === "awaiting-approval" ||
      job.status === "complete" ||
      job.status === "scraping-competitor-ads" ||
      (companyAdCount !== null);
    if (pastAdScrape) break;
    if (job.status === "error") {
      console.error(`[test] job errored: ${job.error}`);
      break;
    }
  }

  console.log(`\n[test] === RESULT ===`);
  console.log(`[test] companyAdCount=${companyAdCount}`);
  if (scraperTrace) console.log(`[test] trace: ${scraperTrace}`);
  if (companyAdCount === null) {
    console.error(`[test] FAIL: never reached ad-scrape result within ${MAX_POLL_MS / 1000}s`);
    process.exit(1);
  }
  if (companyAdCount < minCount) {
    console.error(`[test] FAIL: count ${companyAdCount} < expected min ${minCount}`);
    process.exit(1);
  }
  console.log(`[test] PASS: ${companyAdCount} >= ${minCount}`);
}

main().catch((e) => {
  console.error(`[test] crashed:`, e);
  process.exit(1);
});
