/**
 * Streams a curated reference ad jpg from src/lib/references/ad-library.
 *
 * The curated library lives next to the runtime code (not in /public) so
 * we serve it through this route. Only matches files that actually exist
 * in the curated tree — never returns anything outside LIB_ROOT.
 */
import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { resolveCuratedFile } from "@/lib/style-library/curated-loader";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ brand: string; file: string }> },
) {
  const { brand, file } = await params;
  if (!/^[a-z0-9-]+$/i.test(brand) || !/^[a-z0-9.-]+$/i.test(file)) {
    return NextResponse.json({ error: "Bad path" }, { status: 400 });
  }

  const full = await resolveCuratedFile(brand, file);
  if (!full) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buf = await fs.readFile(full);
  const ext = path.extname(file).toLowerCase();
  const contentType =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : "image/jpeg";
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
