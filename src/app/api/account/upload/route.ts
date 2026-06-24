import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file    = formData.get("file")    as File   | null;
  const company = formData.get("company") as string | null;

  if (!file || !company) {
    return NextResponse.json({ error: "Missing file or company" }, { status: 400 });
  }

  const dir = path.join(process.cwd(), "data", company, "account", "uploads");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const bytes    = await file.arrayBuffer();
  const buffer   = Buffer.from(bytes);
  const ts       = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filename = `${ts}_${safeName}`;

  fs.writeFileSync(path.join(dir, filename), buffer);

  return NextResponse.json({ success: true, filename });
}
