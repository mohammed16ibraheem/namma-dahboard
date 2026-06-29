import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import type { ReportType } from "@/app/api/account/route";

const DATA_DIR = path.join(process.cwd(), "data");

// POST /api/account/file — saves original Excel into the timestamped upload folder
// Body: multipart/form-data { file, company, type, uploadFolder }
export async function POST(req: NextRequest) {
  const formData   = await req.formData();
  const file       = formData.get("file")         as File   | null;
  const company    = formData.get("company")       as string | null;
  const type       = formData.get("type")          as ReportType | null;
  const uploadFolder = formData.get("uploadFolder") as string | null;

  if (!file || !company || !type || !uploadFolder) {
    return NextResponse.json({ error: "Missing file, company, type, or uploadFolder" }, { status: 400 });
  }

  const dir = path.join(DATA_DIR, company, "finance", "financial-reports", type, uploadFolder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const safeName = file.name.replace(/[^a-zA-Z0-9._\-() ]/g, "_");
  const filepath = path.join(dir, safeName);

  const bytes = await file.arrayBuffer();
  fs.writeFileSync(filepath, Buffer.from(bytes));

  return NextResponse.json({ success: true, saved: safeName, uploadFolder });
}
