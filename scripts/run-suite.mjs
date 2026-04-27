#!/usr/bin/env node
// Runs scraper test against a panel of brands. Prints a results table.
// Failures don't abort — we want to see all of them in one pass.
import { spawn } from "node:child_process";

const BRANDS = [
  // [name, url, minExpectedActiveAdCount]
  ["Headway", "https://makeheadway.com", 100],
  ["Canva", "https://www.canva.com", 50],
  ["Notion", "https://www.notion.so", 20],
  ["Duolingo", "https://www.duolingo.com", 50],
];

function run(args) {
  return new Promise((resolve) => {
    const out = [];
    const p = spawn("node", ["scripts/test-scraper.mjs", ...args], { stdio: ["ignore", "pipe", "pipe"] });
    p.stdout.on("data", (d) => { process.stdout.write(d); out.push(d.toString()); });
    p.stderr.on("data", (d) => { process.stderr.write(d); out.push(d.toString()); });
    p.on("close", (code) => resolve({ code, out: out.join("") }));
  });
}

const results = [];
for (const [name, url, min] of BRANDS) {
  console.log(`\n========== ${name} ==========`);
  const t0 = Date.now();
  const { code, out } = await run([name, url, String(min)]);
  const m = out.match(/companyAdCount=(\d+|null)/);
  const count = m ? m[1] : "?";
  results.push({ name, status: code === 0 ? "PASS" : "FAIL", count, min, durSec: Math.round((Date.now() - t0) / 1000) });
}

console.log(`\n========== SUMMARY ==========`);
for (const r of results) {
  console.log(`${r.status.padEnd(4)}  ${r.name.padEnd(12)} count=${r.count.padEnd(6)} min=${r.min}  (${r.durSec}s)`);
}
const failed = results.filter((r) => r.status === "FAIL").length;
console.log(`\n${failed === 0 ? "ALL PASS" : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
