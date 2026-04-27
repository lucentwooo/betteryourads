import { Redis } from "@upstash/redis";
import fs from "fs/promises";
import path from "path";
import { STORAGE_ROOT } from "../storage-root";

/**
 * Key-value store.
 *
 * Prod (Upstash Redis, via Vercel Marketplace): uses the REST client and
 * survives cold starts and instance swaps.
 *
 * Local dev (no Upstash env vars): falls back to JSON files under
 * ./data/kv/<key>.json so you can still iterate without any cloud setup.
 */

// Vercel Marketplace's Upstash integration provisions KV_REST_API_* names
// (kept from the legacy Vercel KV product). Upstash's direct integrations
// use UPSTASH_REDIS_REST_*. Accept both.
const redisUrl =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const redis: Redis | null =
  redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

function localPath(key: string): string {
  // Redis-style "namespace:id" keys → file path namespace/id.json
  const safe = key.replace(/[^a-z0-9:._-]/gi, "_");
  return path.join(STORAGE_ROOT, "kv", ...safe.split(":")) + ".json";
}

export async function kvGet<T>(key: string): Promise<T | null> {
  if (redis) {
    const v = await redis.get<T>(key);
    return v ?? null;
  }
  try {
    const data = await fs.readFile(localPath(key), "utf-8");
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  if (redis) {
    await redis.set(key, value);
    return;
  }
  const p = localPath(key);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(value, null, 2));
}

export async function kvDel(key: string): Promise<void> {
  if (redis) {
    await redis.del(key);
    return;
  }
  try {
    await fs.unlink(localPath(key));
  } catch {
    // ignore
  }
}

export function kvBackendName(): "upstash" | "filesystem" {
  return redis ? "upstash" : "filesystem";
}
