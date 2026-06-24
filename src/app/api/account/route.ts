import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

/*
  Storage structure:
    data/
      {company}/
        finance/
          financial-reports/
            balance-sheet/
              31-May-2025.json
            profit-loss/
              31-May-2025.json
            cash-flow/
              ...
            executive-summary/
              ...
            tax-report/
              ...
*/
function reportDir(company: string, reportType: ReportType): string {
  return path.join(DATA_DIR, company, "finance", "financial-reports", reportType);
}

function safePeriod(period: string): string {
  return period.replace(/\//g, "-");
}

export type BsRow     = { label: string; indent?: number; value: number | null; type: "section" | "line" | "total" };
export type CfRow     = { label: string; indent?: number; value: number | null; type: "section" | "line" | "total" };
export type ReportRow = {
  label: string;
  indent?: number;
  value: number | null;          // primary value (Total/YTD — first column)
  values?: (number | null)[];    // all column values including monthly breakdown
  type: "section" | "line" | "total";
};

export type ReportType =
  | "balance-sheet"
  | "profit-loss"
  | "cash-flow"
  | "executive-summary"
  | "tax-report";

export type PeriodFile = {
  reportType?: ReportType;
  period: string;
  company: string;
  uploadedAt: string;
  fileName?: string;    // original uploaded filename e.g. "DS plstic P&L-detailed.xlsx"
  bs: BsRow[];
  cf: CfRow[];
  rows?: ReportRow[];
  columns?: string[];   // column headers e.g. ["Total", "Jan", "Feb", "Mar", "Apr", "May"]
};

// GET /api/account?company=diamond-star&type=balance-sheet
export async function GET(req: NextRequest) {
  const company    = req.nextUrl.searchParams.get("company");
  const reportType = (req.nextUrl.searchParams.get("type") ?? "balance-sheet") as ReportType;
  if (!company) return NextResponse.json({ error: "Missing company" }, { status: 400 });

  const dir = reportDir(company, reportType);
  if (!fs.existsSync(dir)) return NextResponse.json({ periods: [] });

  const periods: PeriodFile[] = fs
    .readdirSync(dir)
    .filter(f => f.endsWith(".json") && f !== ".gitkeep")
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) as PeriodFile)
    .sort((a, b) => a.period.localeCompare(b.period));

  return NextResponse.json({ periods });
}

// POST /api/account — save one period
export async function POST(req: NextRequest) {
  const body = await req.json() as PeriodFile;
  if (!body.company || !body.period || !body.reportType) {
    return NextResponse.json({ error: "Missing company, period, or reportType" }, { status: 400 });
  }

  const dir = reportDir(body.company, body.reportType);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filepath = path.join(dir, `${safePeriod(body.period)}.json`);
  fs.writeFileSync(filepath, JSON.stringify(body, null, 2), "utf-8");

  return NextResponse.json({ success: true, period: body.period });
}

// DELETE /api/account?company=diamond-star&period=31-May-2025&type=balance-sheet
export async function DELETE(req: NextRequest) {
  const company    = req.nextUrl.searchParams.get("company");
  const period     = req.nextUrl.searchParams.get("period");
  const reportType = (req.nextUrl.searchParams.get("type") ?? "balance-sheet") as ReportType;
  if (!company || !period) return NextResponse.json({ error: "Missing params" }, { status: 400 });

  const filepath = path.join(reportDir(company, reportType), `${safePeriod(period)}.json`);
  if (fs.existsSync(filepath)) fs.unlinkSync(filepath);

  return NextResponse.json({ success: true });
}
