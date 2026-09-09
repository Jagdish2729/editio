import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const runtime = "nodejs";

const mimeByExtension: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".m4v": "video/x-m4v",
};

type RouteProps = { params: Promise<{ filename: string }> };

export async function GET(_request: Request, { params }: RouteProps) {
  try {
    const { filename } = await params;
    if (!/^[a-zA-Z0-9-]+\.(mp4|mov|webm|m4v)$/i.test(filename)) {
      return NextResponse.json({ error: "Invalid file." }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), "data", "uploads", filename);
    const buffer = await readFile(filePath);
    const extension = path.extname(filename).toLowerCase();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": mimeByExtension[extension] || "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
}
