import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

/*
  Storage structure (NEW — timestamp subfolders):
    data/
      {company}/
        finance/
          financial-reports/
            balance-sheet/
              2026-06-29_11-07-23/        ← one subfolder per upload batch
                31-May-2025.json
                DS-BS.xlsx
              2026-06-30_09-00-00/        ← tomorrow's upload
                31-May-2025.json
                DS-BS.xlsx
            trial-balance/
              2026-06-29_11-07-23/
                31-Jan-2026.json
                31-May-2026.json
                DSA-TBs-Jan-May-2026.xlsx
*/
function reportDir(company: string, reportType: ReportType): string {
  return path.join(DATA_DIR, company, "finance", "financial-reports", reportType);
}

function safePeriod(period: string): string {
  return period.replace(/\//g, "-");
}

/** Convert ISO timestamp → folder-safe string: "2026-06-29_11-07-23" */
function isoToFolder(iso: string): string {
  return iso.slice(0, 19).replace("T", "_").replace(/:/g, "-");
}

export type BsRow     = { label: string; indent?: number; value: number | null; type: "section" | "line" | "total" };
export type CfRow     = { label: string; indent?: number; value: number | null; type: "section" | "line" | "total" };
export type ReportRow = {
  label: string;
  indent?: number;
  value: number | null;
  values?: (number | null)[];
  type: "section" | "line" | "total";
};

export type ReportType =
  | "balance-sheet"
  | "trial-balance"
  | "profit-loss"
  | "cash-flow"
  | "executive-summary"
  | "tax-report";

export type PeriodFile = {
  reportType?: ReportType;
  period: string;
  company: string;
  uploadedAt: string;
  fileName?: string;       // original uploaded filename
  uploadFolder?: string;   // timestamp subfolder (injected by GET, stored in POST)
  bs: BsRow[];
  cf: CfRow[];
  rows?: ReportRow[];
  columns?: string[];
};

// ── GET /api/account?company=X&type=Y ────────────────────────────────────────
export async function GET(req: NextRequest) {
  const company    = req.nextUrl.searchParams.get("company");
  const reportType = (req.nextUrl.searchParams.get("type") ?? "balance-sheet") as ReportType;
  if (!company) return NextResponse.json({ error: "Missing company" }, { status: 400 });

  const dir = reportDir(company, reportType);
  if (!fs.existsSync(dir)) return NextResponse.json({ periods: [] });

  const periods: PeriodFile[] = [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;           // skip flat files (old format)
    const subDir = path.join(dir, entry.name);
    const jsonFiles = fs.readdirSync(subDir)
      .filter(f => f.endsWith(".json") && f !== ".gitkeep");
    for (const jsonFile of jsonFiles) {
      try {
        const data = JSON.parse(
          fs.readFileSync(path.join(subDir, jsonFile), "utf-8")
        ) as PeriodFile;
        data.uploadFolder = entry.name;           // inject folder name so frontend can pass it back on delete
        periods.push(data);
      } catch {}
    }
  }

  // Sort by period string ascending
  periods.sort((a, b) => a.period.localeCompare(b.period));

  return NextResponse.json({ periods });
}

// ── POST /api/account — save one period ──────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json() as PeriodFile;
  if (!body.company || !body.period || !body.reportType) {
    return NextResponse.json({ error: "Missing company, period, or reportType" }, { status: 400 });
  }

  // Use the uploadFolder from the body (frontend generates once per upload batch)
  const folder = body.uploadFolder ?? isoToFolder(body.uploadedAt ?? new Date().toISOString());
  const dir    = path.join(reportDir(body.company, body.reportType), folder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filepath = path.join(dir, `${safePeriod(body.period)}.json`);
  fs.writeFileSync(filepath, JSON.stringify({ ...body, uploadFolder: folder }, null, 2), "utf-8");

  return NextResponse.json({ success: true, period: body.period, uploadFolder: folder });
}

// ── DELETE /api/account?company=X&period=Y&type=Z&uploadFolder=W ─────────────
export async function DELETE(req: NextRequest) {
  const company      = req.nextUrl.searchParams.get("company");
  const period       = req.nextUrl.searchParams.get("period");
  const reportType   = (req.nextUrl.searchParams.get("type") ?? "balance-sheet") as ReportType;
  const uploadFolder = req.nextUrl.searchParams.get("uploadFolder");

  if (!company || !period) return NextResponse.json({ error: "Missing params" }, { status: 400 });

  const baseDir = reportDir(company, reportType);
  let filepath: string | null = null;
  let subDir: string | null = null;

  if (uploadFolder) {
    // Fast path: we know the exact subfolder
    const candidate = path.join(baseDir, uploadFolder, `${safePeriod(period)}.json`);
    if (fs.existsSync(candidate)) { filepath = candidate; subDir = path.dirname(candidate); }
  }

  if (!filepath && fs.existsSync(baseDir)) {
    // Fallback: search all subfolders (handles old data or missing uploadFolder param)
    for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(baseDir, entry.name, `${safePeriod(period)}.json`);
      if (fs.existsSync(candidate)) { filepath = candidate; subDir = path.join(baseDir, entry.name); break; }
    }
  }

  if (!filepath || !subDir) return NextResponse.json({ success: true }); // already gone

  // Read Excel filename before deleting the JSON
  let excelFileName: string | undefined;
  try {
    const data = JSON.parse(fs.readFileSync(filepath, "utf-8")) as PeriodFile;
    excelFileName = data.fileName;
  } catch {}
  fs.unlinkSync(filepath);

  // If the subfolder has no more JSONs, delete the Excel and the folder itself
  const remainingJsons = fs.readdirSync(subDir).filter(f => f.endsWith(".json") && f !== ".gitkeep");
  if (!remainingJsons.length) {
    if (excelFileName) {
      const safeName  = excelFileName.replace(/[^a-zA-Z0-9._\-() ]/g, "_");
      const excelPath = path.join(subDir, safeName);
      if (fs.existsSync(excelPath)) fs.unlinkSync(excelPath);
    }
    // Remove all remaining non-JSON files then the folder
    for (const f of fs.readdirSync(subDir)) {
      try { fs.unlinkSync(path.join(subDir, f)); } catch {}
    }
    try { fs.rmdirSync(subDir); } catch {}
  }

  return NextResponse.json({ success: true });
}
