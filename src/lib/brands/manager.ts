import type { Job } from "../types";
import type { BrandRecord, LockedVisualSystem } from "./types";
import { toSlug } from "./slug";
import { kvGet, kvSet } from "../storage/kv";

function brandKey(slug: string): string {
  return `brand:${slug}`;
}

export async function getBrand(slug: string): Promise<BrandRecord | null> {
  return kvGet<BrandRecord>(brandKey(slug));
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

  await kvSet(brandKey(slug), merged);
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

  await kvSet(brandKey(slug), brand);
  return brand;
}
