import fs from "fs/promises";
import path from "path";
import type { Job } from "../types";
import type { BrandRecord, LockedVisualSystem } from "./types";
import { toSlug } from "./slug";

const BRANDS_DIR = path.join(process.cwd(), "data", "brands");

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function brandPath(slug: string): string {
  return path.join(BRANDS_DIR, `${slug}.json`);
}

export async function getBrand(slug: string): Promise<BrandRecord | null> {
  try {
    const data = await fs.readFile(brandPath(slug), "utf-8");
    return JSON.parse(data) as BrandRecord;
  } catch {
    return null;
  }
}

export async function upsertBrandFromJob(job: Job): Promise<BrandRecord> {
  const slug = toSlug(job.input.companyName);
  const existing = await getBrand(slug);
  const now = new Date().toISOString();

  // Preserve locked fields untouched. Merge-update everything else from the job.
  const merged: BrandRecord = {
    slug,
    displayName: job.input.companyName,
    website: job.input.companyUrl,
    category: existing?.category,
    audienceRegister: existing?.audienceRegister ?? "unassigned",
    brandProfile: job.brandProfile ?? existing?.brandProfile,
    proofPoints: existing?.proofPoints,
    locked: existing?.locked,
    jobHistory: [
      ...(existing?.jobHistory ?? []),
      { jobId: job.id, completedAt: job.completedAt ?? now },
    ],
    updatedAt: now,
  };

  await ensureDir(BRANDS_DIR);
  await fs.writeFile(brandPath(slug), JSON.stringify(merged, null, 2));
  return merged;
}

export async function lockVisualSystem(
  slug: string,
  system: LockedVisualSystem
): Promise<BrandRecord | null> {
  const brand = await getBrand(slug);
  if (!brand) return null;

  brand.locked = {
    visualSystem: system,
    _note:
      "Locked by ad-creative-generator after a validated run. Re-analysis will not overwrite these fields.",
  };
  brand.updatedAt = new Date().toISOString();

  await fs.writeFile(brandPath(slug), JSON.stringify(brand, null, 2));
  return brand;
}
