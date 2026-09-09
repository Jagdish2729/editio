import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files").filter((item): item is File => item instanceof File);

    if (!files.length) {
      return NextResponse.json({ error: "No video files received." }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), "data", "uploads");
    await mkdir(uploadDir, { recursive: true });

    const uploaded = [];
    for (const file of files) {
      if (!file.type.startsWith("video/")) continue;
      const extension = path.extname(file.name) || ".mp4";
      const storedName = `${crypto.randomUUID()}${extension}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(path.join(uploadDir, storedName), buffer);
      uploaded.push({ originalName: file.name, path: `data/uploads/${storedName}`, size: file.size, type: file.type });
    }

    if (!uploaded.length) {
      return NextResponse.json({ error: "Only video files are supported." }, { status: 400 });
    }

    return NextResponse.json({ ok: true, files: uploaded });
  } catch {
    return NextResponse.json({ error: "Upload failed." }, { status: 500 });
  }
}
