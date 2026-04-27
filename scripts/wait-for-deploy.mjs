#!/usr/bin/env node
// Wait until the latest deploy on feat/persistent-storage matches a target SHA.
// Usage: node scripts/wait-for-deploy.mjs <expected-sha-prefix> [timeout-sec]
import { execSync } from "node:child_process";

const expected = (process.argv[2] || "").slice(0, 7);
const timeoutSec = parseInt(process.argv[3] || "300", 10);
if (!expected) {
  console.error("usage: wait-for-deploy.mjs <sha-prefix>");
  process.exit(2);
}

const baseUrl =
  "https://betteryourads-5orl-git-feat-pe-c6e5d5-lucents-projects-255f413a.vercel.app";

const t0 = Date.now();
console.log(`[wait] target sha=${expected}, polling ${baseUrl}/api/version`);
while ((Date.now() - t0) / 1000 < timeoutSec) {
  try {
    const r = await fetch(`${baseUrl}/api/version`);
    if (r.ok) {
      const v = await r.json();
      const cur = (v.sha || "").slice(0, 7);
      if (cur === expected) {
        console.log(`[wait] DEPLOYED sha=${cur} after ${Math.round((Date.now() - t0) / 1000)}s`);
        process.exit(0);
      }
      console.log(`[wait] current=${cur || "?"} expected=${expected}`);
    } else {
      console.log(`[wait] /api/version → ${r.status}`);
    }
  } catch (e) {
    console.log(`[wait] fetch err: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 10000));
}
console.error(`[wait] TIMEOUT — no deploy with sha=${expected} after ${timeoutSec}s`);
process.exit(1);
