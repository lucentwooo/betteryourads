import { put } from "@vercel/blob";
import fs from "fs/promises";
import path from "path";
import { STORAGE_ROOT } from "../storage-root";

/**
 * Image store.
 *
 * Prod (Vercel Blob, via Marketplace): persistent public HTTPS URLs.
 * Local dev (no Blob token): writes under ./data/<key> and returns a path the
 *   dev server can serve via /api/screenshots/[...] (unchanged from before).
 */

const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

/**
 * Store an image buffer and return a URL suitable for <img src>.
 * @param key relative key like `jobs/abc123/ads/ad-1.png`
 */
export async function putImage(
  key: string,
  data: Buffer,
  contentType = "image/png"
): Promise<string> {
  if (hasBlob) {
    const blob = await put(key, data, {
      access: "public",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return blob.url;
  }

  // Local fallback: write under STORAGE_ROOT and return a relative URL the
  // screenshots proxy route can serve.
  const full = path.join(STORAGE_ROOT, key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
  // key already starts with "jobs/..." so match the existing proxy format.
  if (key.startsWith("jobs/")) {
    return `/api/screenshots/${key.slice("jobs/".length)}`;
  }
  return `/api/screenshots/${key}`;
}

/**
 * Fetch image bytes back — for operations that need raw bytes (sharp analysis,
 * ZIP export, etc.). Handles both https Blob URLs and local /api/screenshots paths.
 */
export async function fetchImage(urlOrPath: string): Promise<Buffer> {
  if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
    const res = await fetch(urlOrPath);
    if (!res.ok) throw new Error(`fetchImage ${urlOrPath} -> ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  if (urlOrPath.startsWith("/api/screenshots/")) {
    const rel = urlOrPath.replace("/api/screenshots/", "");
    return fs.readFile(path.join(STORAGE_ROOT, "jobs", rel));
  }
  // Legacy absolute filesystem path
  return fs.readFile(urlOrPath);
}

export function imageBackendName(): "blob" | "filesystem" {
  return hasBlob ? "blob" : "filesystem";
}
