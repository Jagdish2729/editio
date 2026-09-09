import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const filename = new URL(request.url).searchParams.get("name") || "";
    if (!filename || filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
      return NextResponse.json({ error: "Invalid render file." }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), "data", "renders", filename);
    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Render file not found." }, { status: 404 });
  }
}
