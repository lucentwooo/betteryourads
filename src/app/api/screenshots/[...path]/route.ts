import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { STORAGE_ROOT } from "@/lib/storage-root";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;
  const filePath = path.join(STORAGE_ROOT, "jobs", ...pathSegments);

  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();

    const contentType =
      ext === ".png"
        ? "image/png"
        : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : "application/octet-stream";

    return new NextResponse(file, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
