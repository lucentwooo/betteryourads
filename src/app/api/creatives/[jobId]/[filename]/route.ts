import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string; filename: string }> }
) {
  const { jobId, filename } = await params;
  if (!/^[a-z0-9-]+$/i.test(jobId) || !/^[a-z0-9.-]+$/i.test(filename)) {
    return NextResponse.json({ error: "Bad path" }, { status: 400 });
  }
  const fullPath = path.join(process.cwd(), "data", "jobs", jobId, "creatives", filename);
  try {
    const buf = await fs.readFile(fullPath);
    const ext = path.extname(filename).toLowerCase();
    const contentType = ext === ".png" ? "image/png" : ext === ".jpg" ? "image/jpeg" : "application/octet-stream";
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=3600" },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
