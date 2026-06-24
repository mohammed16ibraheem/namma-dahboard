"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight, LogOut, Upload, FileSpreadsheet,
  Trash2, CalendarDays, Info, TrendingUp,
  ArrowDownUp, Receipt, FileBarChart, Landmark,
} from "lucide-react";
import * as XLSX from "xlsx";
import CompanySelector from "@/components/company-selector";
import type { PeriodFile, BsRow, CfRow, ReportType, ReportRow } from "@/app/api/account/route";

const BRAND  = "#1B3A6B";
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const REPORT_TYPES = [
  {
    key: "balance-sheet"      as ReportType,
    label: "Balance Sheet",
    description: "Upload and view balance sheet periods",
    Icon: Landmark,
    color: BRAND,
    border: BRAND,
    iconBg: "#EEF2F9",
  },
  {
    key: "profit-loss"        as ReportType,
    label: "Profit and Loss",
    description: "Upload and view profit & loss statements",
    Icon: TrendingUp,
    color: "#059669",
    border: "#059669",
    iconBg: "#ECFDF5",
  },
  {
    key: "cash-flow"          as ReportType,
    label: "Cash Flow Statement",
    description: "Upload and view cash flow statements",
    Icon: ArrowDownUp,
    color: "#0891B2",
    border: "#0891B2",
    iconBg: "#ECFEFF",
  },
  {
    key: "executive-summary"  as ReportType,
    label: "Executive Summary",
    description: "Upload and view executive summary reports",
    Icon: FileBarChart,
    color: "#7C3AED",
    border: "#7C3AED",
    iconBg: "#F5F3FF",
  },
  {
    key: "tax-report"         as ReportType,
    label: "Tax Report",
    description: "Upload and view tax reports",
    Icon: Receipt,
    color: "#D97706",
    border: "#D97706",
    iconBg: "#FFFBEB",
  },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function excelDateToStr(serial: number): string {
  try {
    const d = XLSX.SSF.parse_date_code(serial);
    return `${String(d.d).padStart(2,"0")}-${MONTHS[d.m-1]}-${d.y}`;
  } catch { return String(serial); }
}

function todayStr() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,"0")}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

function findFirstDateSerial(rows: unknown[][], maxRow = 8): string {
  for (let i = 0; i < Math.min(maxRow, rows.length); i++) {
    for (const cell of rows[i] as (string | number)[]) {
      if (typeof cell === "number" && cell > 40000 && cell < 55000) {
        try { return excelDateToStr(cell); } catch {}
      }
    }
  }
  return "";
}

/** Parse a raw cell value (with leading spaces) into a structured row. */
function parseRawLabel(raw: string): { label: string; indent: number; type: "section" | "line" | "total" } {
  const spaces = raw.length - raw.trimStart().length;
  const label  = raw.trim();
  const upper  = label.toUpperCase();
  let type: "section" | "line" | "total";
  if (
    upper.startsWith("TOTAL") || upper.startsWith("GROSS PROFIT") ||
    upper.startsWith("NET PROFIT") || upper.startsWith("NET INCOME") ||
    upper.startsWith("NET LOSS") || upper === "CLOSING CASH AND BANK" ||
    upper.startsWith("TOTAL EXPENSES") || upper.startsWith("TOTAL INCOME")
  ) {
    type = "total";
  } else if (spaces <= 1) {
    type = "section";
  } else {
    type = "line";
  }
  // indent: 0=section, 1=4-space item, 2=8-space item
  const indent = spaces <= 1 ? 0 : Math.floor((spaces - 1) / 4);
  return { label, indent, type };
}

/**
 * Auto-detect which column contains account labels (leading whitespace) and
 * which contains the primary value (first real numeric after the label col).
 */
function detectLabelAndValueCols(rows: unknown[][]): { labelCol: number; valueCol: number } {
  const leadingCounts: number[] = new Array(12).fill(0);
  const numericCounts: number[] = new Array(12).fill(0);

  for (const row of rows.slice(4, Math.min(50, rows.length))) {
    const r = row as (string | number)[];
    for (let i = 0; i < Math.min(r.length, 10); i++) {
      const v = r[i];
      if (typeof v === "string" && v.length > 2 && v !== v.trimStart()) leadingCounts[i]++;
      if (typeof v === "number" && Number.isFinite(v) && !(v > 40000 && v < 55000)) numericCounts[i]++;
    }
  }

  let labelCol = 1;
  let maxLeading = 0;
  for (let i = 0; i < leadingCounts.length; i++) {
    if (leadingCounts[i] > maxLeading) { maxLeading = leadingCounts[i]; labelCol = i; }
  }

  // Value col: first numeric col after labelCol (skip date serial range)
  let valueCol = labelCol + 1;
  for (let i = labelCol + 1; i < numericCounts.length; i++) {
    if (numericCounts[i] >= 3) { valueCol = i; break; }
  }

  return { labelCol, valueCol };
}

/**
 * Scan header rows for the "Closing Balance" column (used in trial balance files).
 * Returns the column index, or fallback if not found.
 */
function findClosingBalanceCol(rows: unknown[][], fallback: number): number {
  for (let ri = 0; ri < Math.min(8, rows.length); ri++) {
    const row = rows[ri] as (string | number)[];
    for (let ci = 0; ci < row.length; ci++) {
      const s = String(row[ci] ?? "").trim().toLowerCase();
      if (s === "closing balance" || s === "closing bal") return ci;
    }
  }
  return fallback;
}

// ─── Parsers ─────────────────────────────────────────────────────────────────

/**
 * Balance Sheet — handles two formats:
 *  A) Original fixed layout: row 3 has date serials at col D/E; BS cols B/D/E; CF cols H/J/K
 *  B) Trial Balance: auto-detects label col and "Closing Balance" col
 */
function parseBalanceSheet(rows: unknown[][], company: string): PeriodFile[] {
  // ── Format A: date serials at row 3 col D/E ──
  const row3    = (rows[3] ?? []) as unknown[];
  const serial1 = Number(row3[3]);
  const serial2 = Number(row3[4]);

  if (!isNaN(serial1) && serial1 > 40000 && serial1 < 55000) {
    const p1 = excelDateToStr(serial1);
    const p2 = (!isNaN(serial2) && serial2 > 40000 && serial2 < 55000) ? excelDateToStr(serial2) : "";
    const bs1: BsRow[] = [], bs2: BsRow[] = [];
    const cf1: CfRow[] = [], cf2: CfRow[] = [];

    rows.slice(4).forEach((r) => {
      const row = r as (string | number)[];
      const raw = String(row[1] || "");
      if (raw.trim()) {
        const { label, indent, type } = parseRawLabel(raw);
        const v1 = row[3] !== "" ? Number(row[3]) : null;
        const v2 = row[4] !== "" ? Number(row[4]) : null;
        if (p1) bs1.push({ label, indent, value: isNaN(v1 as number) ? null : v1, type });
        if (p2) bs2.push({ label, indent, value: isNaN(v2 as number) ? null : v2, type });
      }
      const rawCf = String(row[7] || "");
      if (rawCf.trim()) {
        const { label, indent, type } = parseRawLabel(rawCf);
        const v1 = row[9]  !== "" ? Number(row[9])  : null;
        const v2 = row[10] !== "" ? Number(row[10]) : null;
        if (p1) cf1.push({ label, indent, value: isNaN(v1 as number) ? null : v1, type });
        if (p2) cf2.push({ label, indent, value: isNaN(v2 as number) ? null : v2, type });
      }
    });

    const now = new Date().toISOString();
    const result: PeriodFile[] = [];
    if (p1 && bs1.length) result.push({ reportType: "balance-sheet", period: p1, company, uploadedAt: now, bs: bs1, cf: cf1 });
    if (p2 && bs2.length) result.push({ reportType: "balance-sheet", period: p2, company, uploadedAt: now, bs: bs2, cf: cf2 });
    if (result.length) return result;
  }

  // ── Format B: Trial Balance — auto-detect label col and "Closing Balance" col ──
  const period = findFirstDateSerial(rows) || todayStr();
  const { labelCol, valueCol: defaultValueCol } = detectLabelAndValueCols(rows);
  const valueCol = findClosingBalanceCol(rows, defaultValueCol);

  // Skip header rows: start from first row where label col has a leading-space string
  let dataStart = 0;
  for (let i = 0; i < rows.length; i++) {
    const raw = String((rows[i] as unknown[])[labelCol] ?? "");
    if (raw.trim().length > 2 && raw !== raw.trimStart()) { dataStart = i; break; }
  }

  const bsRows: BsRow[] = [];
  rows.slice(dataStart).forEach(r => {
    const row = r as (string | number | null)[];
    const raw = String(row[labelCol] ?? "");
    if (!raw.trim()) return;
    const { label, indent, type } = parseRawLabel(raw);
    const v = row[valueCol];
    const n = v !== "" && v !== null && v !== undefined
      ? (typeof v === "number" ? v : parseFloat(String(v)))
      : null;
    const numVal = n !== null && Number.isFinite(n) ? n : null;
    const effectiveType = (type === "section" && numVal !== null) ? "line" : type;
    bsRows.push({ label, indent, value: numVal, type: effectiveType });
  });

  if (!bsRows.length) return [];
  return [{ reportType: "balance-sheet", period, company, uploadedAt: new Date().toISOString(), bs: bsRows, cf: [] }];
}

/**
 * Generic parser for P&L, Cash Flow, Executive Summary, Tax Report.
 * Auto-detects label col (leading whitespace), value col (first YTD numeric),
 * and ALL column headers (Total, Jan, Feb … or date serials).
 * Stores every column's value per row so the table can show all months.
 */
function parseGenericReport(rows: unknown[][], company: string, reportType: ReportType): PeriodFile[] {
  const period = findFirstDateSerial(rows, 8) || todayStr();
  const { labelCol, valueCol } = detectLabelAndValueCols(rows);

  // ── Find the header row ──
  // It's the row (in rows 0-8) where row[valueCol] is a text string or date serial
  let headerRowIdx = -1;
  for (let ri = 0; ri < Math.min(8, rows.length); ri++) {
    const v = (rows[ri] as (string | number)[])[valueCol];
    if (
      (typeof v === "string" && v.trim().length > 0) ||
      (typeof v === "number" && v > 40000 && v < 55000)
    ) { headerRowIdx = ri; break; }
  }

  // ── Extract column names from header row ──
  const columns: string[] = [];
  if (headerRowIdx >= 0) {
    const hr = rows[headerRowIdx] as (string | number)[];
    for (let ci = valueCol; ci < Math.min(hr.length, valueCol + 10); ci++) {
      const v = hr[ci];
      if (v === "" || v === null || v === undefined) break;
      if (typeof v === "number" && v > 40000 && v < 55000) {
        try { columns.push(MONTHS[(XLSX.SSF.parse_date_code(v) as { m: number }).m - 1]); }
        catch { break; }
      } else {
        const s = String(v).trim();
        if (s) columns.push(s); else break;
      }
    }
  }
  if (!columns.length) columns.push("Total");
  const numCols = columns.length;

  // ── Data start: first row where label col has a leading-space string ──
  let dataStart = 0;
  for (let i = 0; i < Math.min(12, rows.length); i++) {
    const raw = String((rows[i] as unknown[])[labelCol] ?? "");
    if (raw.trim().length > 2 && raw !== raw.trimStart()) { dataStart = i; break; }
  }

  const dataRows: ReportRow[] = [];
  rows.slice(dataStart).forEach(r => {
    const row = r as (string | number | null | undefined)[];
    const raw = String(row[labelCol] ?? "");
    if (!raw.trim() || /^\d+(\.\d+)?$/.test(raw.trim())) return;
    const { label, indent, type } = parseRawLabel(raw);

    // Collect all column values
    const values: (number | null)[] = [];
    for (let ci = valueCol; ci < valueCol + numCols; ci++) {
      const v = row[ci];
      if (v !== "" && v !== null && v !== undefined) {
        const n = typeof v === "number" ? v : parseFloat(String(v));
        values.push(Number.isFinite(n) ? n : null);
      } else {
        values.push(null);
      }
    }

    // Primary value = first column (Total / YTD)
    const value = values[0] ?? null;
    // If parseRawLabel said "section" but this row has real values, treat as line
    const effectiveType = (type === "section" && values.some(v => v !== null)) ? "line" : type;
    dataRows.push({ label, indent, value, values, type: effectiveType });
  });

  if (!dataRows.length) return [];
  return [{
    reportType, period, company,
    uploadedAt: new Date().toISOString(),
    bs: [], cf: [], rows: dataRows, columns,
  }];
}

// ─── Table display ───────────────────────────────────────────────────────────
const fmt = (n: number | null | undefined) => {
  if (n === null || n === undefined || n === 0) return "—";
  if (n < 0) return `(${Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})})`;
  return n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
};

const INDENT_PX = [0, 16, 32, 48];

function ReportTable({
  rows, title, columns,
}: {
  rows: (BsRow | CfRow | ReportRow)[];
  title: string;
  columns?: string[];
}) {
  const isMulti = columns && columns.length > 1;

  /* ── Multi-column table (P&L style with months) ── */
  if (isMulti) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-white"
          style={{ background: BRAND }}>{title}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] border-collapse" style={{ minWidth: `${200 + columns.length * 110}px` }}>
            <thead>
              <tr style={{ background: "#EEF2F9", borderBottom: `2px solid ${BRAND}` }}>
                <th className="text-left py-2.5 px-5 font-bold sticky left-0 bg-[#EEF2F9] z-10"
                  style={{ color: BRAND, minWidth: "220px" }}>Account</th>
                {columns.map((col, ci) => (
                  <th key={ci} className="text-right py-2.5 px-3 font-bold whitespace-nowrap"
                    style={{ color: ci === 0 ? BRAND : "#374151", minWidth: "100px" }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const vals = (row as ReportRow).values ?? [row.value];
                const indentPx = INDENT_PX[Math.min(row.indent ?? 0, INDENT_PX.length - 1)];

                if (row.type === "section") return (
                  <tr key={i} style={{ background: indentPx === 0 ? "#EEF2F9" : "#F5F7FC", borderTop: indentPx === 0 ? "1px solid #d1dcea" : "none" }}>
                    <td colSpan={columns.length + 1}
                      className="py-2 font-bold uppercase text-[10px] tracking-widest"
                      style={{ paddingLeft: `${20 + indentPx}px`, color: BRAND }}>
                      {row.label}
                    </td>
                  </tr>
                );

                if (row.type === "total") return (
                  <tr key={i} style={{ background: "#f9fafb", borderTop: "2px solid #e5e7eb", borderBottom: "1px solid #e5e7eb" }}>
                    <td className="py-2 font-bold text-gray-800 sticky left-0 bg-[#f9fafb]"
                      style={{ paddingLeft: `${20 + indentPx}px` }}>
                      {row.label}
                    </td>
                    {vals.map((v, vi) => (
                      <td key={vi} className="text-right py-2 px-3 font-bold font-mono tabular-nums"
                        style={{ color: (v ?? 0) < 0 ? "#ef4444" : vi === 0 ? BRAND : "#111827" }}>
                        {fmt(v)}
                      </td>
                    ))}
                  </tr>
                );

                return (
                  <tr key={i} className="border-b border-gray-50 hover:bg-blue-50/30 transition-colors">
                    <td className="py-1.5 text-gray-600 sticky left-0 bg-white hover:bg-blue-50/30"
                      style={{ paddingLeft: `${20 + indentPx}px` }}>
                      {row.label}
                    </td>
                    {vals.map((v, vi) => (
                      <td key={vi} className="text-right py-1.5 px-3 font-mono tabular-nums text-[11px]"
                        style={{ color: (v ?? 0) < 0 ? "#ef4444" : (v ?? 0) === 0 ? "#d1d5db" : vi === 0 ? "#111827" : "#374151" }}>
                        {fmt(v)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  /* ── Single-column table (Balance Sheet, Trial Balance) ── */
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-white flex items-center justify-between"
        style={{ background: BRAND }}>
        <span>{title}</span><span>SAR</span>
      </div>
      {rows.map((row, i) => {
        const indentPx = INDENT_PX[Math.min(row.indent ?? 0, INDENT_PX.length - 1)];
        const isNeg    = (row.value ?? 0) < 0;

        if (row.type === "section") return (
          <div key={i}
            className="py-2 text-[11px] font-bold uppercase tracking-widest flex items-center justify-between"
            style={{
              paddingLeft: `${20 + indentPx}px`, paddingRight: "20px",
              color: BRAND,
              background: indentPx === 0 ? "#EEF2F9" : "#F5F7FC",
              borderTop: indentPx === 0 ? "1px solid #d1dcea" : "none",
            }}>
            <span>{row.label}</span>
            {row.value != null && row.value !== 0 && (
              <span className="font-bold font-mono tabular-nums" style={{ color: isNeg ? "#ef4444" : BRAND }}>
                {fmt(row.value)}
              </span>
            )}
          </div>
        );

        if (row.type === "total") {
          const isKeyTotal =
            row.label.toUpperCase().startsWith("TOTAL ASSETS") ||
            row.label.toUpperCase().startsWith("TOTAL EQUITY") ||
            row.label === "Closing Cash and Bank";
          return (
            <div key={i} className="flex items-center py-2.5 text-[12px]"
              style={{
                paddingLeft: `${20 + indentPx}px`, paddingRight: "20px",
                background: isKeyTotal ? "#EEF2F9" : "#f9fafb",
                borderTop: "1px solid #e5e7eb",
                borderBottom: isKeyTotal ? `2px double ${BRAND}` : "1px solid #e5e7eb",
              }}>
              <span className="flex-1 font-bold" style={{ color: isKeyTotal ? BRAND : "#374151" }}>{row.label}</span>
              <span className="font-bold font-mono tabular-nums"
                style={{ color: isNeg ? "#ef4444" : isKeyTotal ? BRAND : "#111827" }}>
                {fmt(row.value)}
              </span>
            </div>
          );
        }

        return (
          <div key={i}
            className="flex items-center py-1.5 border-b border-gray-50 hover:bg-blue-50/30 transition-colors text-[12px]"
            style={{ paddingLeft: `${20 + indentPx}px`, paddingRight: "20px" }}>
            <span className="flex-1 text-gray-600">{row.label}</span>
            <span className="font-mono tabular-nums text-[11px]"
              style={{ color: isNeg ? "#ef4444" : (row.value ?? 0) === 0 ? "#d1d5db" : "#374151" }}>
              {fmt(row.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Report type view — History + Report tabs ────────────────────────────────
function ReportTypeView({
  company, reportType, onBack,
}: {
  company: string;
  reportType: typeof REPORT_TYPES[number];
  onBack: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [tab,       setTab]       = useState<"history" | "report">("history");
  const [periods,   setPeriods]   = useState<PeriodFile[]>([]);
  const [selected,  setSelected]  = useState<PeriodFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [drag,      setDrag]      = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  // sub-tab inside balance-sheet report view
  const [bsTab,     setBsTab]     = useState<"bs"|"cf">("bs");

  const { key, label, color, border, iconBg, Icon } = reportType;

  const fetchPeriods = useCallback(async () => {
    try {
      const res  = await fetch(`/api/account?company=${company}&type=${key}`);
      const data = await res.json();
      setPeriods(data.periods ?? []);
    } catch {}
  }, [company, key]);

  useEffect(() => { fetchPeriods(); }, [fetchPeriods]);

  const processFile = useCallback(async (file: File) => {
    setUploading(true);
    setUploadMsg("");
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const wb   = XLSX.read(e.target?.result, { type: "array" });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });

        const parsed: PeriodFile[] =
          key === "balance-sheet"
            ? parseBalanceSheet(rows, company)
            : parseGenericReport(rows, company, key);

        // Attach original filename to every parsed period
        const fileName = file.name.replace(/\.[^.]+$/, ""); // strip extension
        parsed.forEach(p => { p.fileName = fileName; });

        if (!parsed.length) { setUploadMsg("No data found in this file."); setUploading(false); return; }

        let saved = 0;
        for (const p of parsed) {
          const res = await fetch("/api/account", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(p),
          });
          if (res.ok) saved++;
        }
        const fd = new FormData();
        fd.append("file", file);
        fd.append("company", company);
        await fetch("/api/account/upload", { method: "POST", body: fd });

        setUploadMsg(`✓ ${saved} period${saved>1?"s":""} saved`);
        await fetchPeriods();
        // Auto-open the first parsed period in the report tab
        if (parsed.length > 0) { openPeriod(parsed[0]); }
      } catch { setUploadMsg("Could not read file."); }
      setUploading(false);
    };
    reader.readAsArrayBuffer(file);
  }, [company, key, fetchPeriods]);

  const handleDelete = async (period: PeriodFile) => {
    await fetch(
      `/api/account?company=${period.company}&period=${encodeURIComponent(period.period)}&type=${key}`,
      { method: "DELETE" }
    );
    if (selected?.period === period.period) { setSelected(null); setTab("history"); }
    fetchPeriods();
  };

  function openPeriod(p: PeriodFile) {
    // If same period clicked again → deselect (toggle off)
    if (selected?.period === p.period) { setSelected(null); return; }
    setSelected(p);
    setBsTab("bs");
    // Stay on whichever tab the user is on — do NOT switch tabs
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0"
          style={{ background: iconBg }}>
          <Icon size={20} style={{ color }} />
        </div>
        <div>
          <h2 className="text-base font-bold text-gray-800">{label}</h2>
          <p className="text-xs text-gray-400">{periods.length} period{periods.length !== 1 ? "s" : ""} in history</p>
        </div>
      </div>

      {/* Tab bar: History | [Report Name] */}
      <div className="flex gap-1 bg-white rounded-xl border border-gray-100 shadow-sm p-1 w-fit">
        <button
          onClick={() => setTab("history")}
          className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all"
          style={{ background: tab === "history" ? BRAND : "transparent", color: tab === "history" ? "#fff" : "#6b7280" }}>
          <FileSpreadsheet size={14} /> History
        </button>
        <button
          onClick={() => setTab("report")}
          className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all"
          style={{ background: tab === "report" ? color : "transparent", color: tab === "report" ? "#fff" : "#6b7280" }}>
          <Icon size={14} /> {label}
        </button>
      </div>

      {/* ── HISTORY TAB ── */}
      {tab === "history" && (
        <div className="space-y-4">
          {/* History list — no upload here */}
          {periods.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
              <FileSpreadsheet size={36} className="text-gray-200 mb-3" />
              <p className="text-gray-400 font-medium text-sm">No records in history yet</p>
              <p className="text-xs text-gray-300 mt-1">
                Go to the <strong>{label}</strong> tab to upload a file
              </p>
              <button onClick={() => setTab("report")}
                className="mt-4 text-xs font-semibold px-4 py-2 rounded-lg transition-all"
                style={{ background: color + "15", color }}>
                Go to {label} →
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                  Upload History
                </span>
                <span className="text-[11px] text-gray-400">
                  {periods.length} record{periods.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Kanban card grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {periods.map((p) => {
                  const highlight =
                    key === "balance-sheet"
                      ? p.bs.find(r => r.label.toUpperCase().startsWith("TOTAL ASSETS"))?.value
                      : (p.rows ?? []).find(r => r.value != null)?.value;
                  const isActive = selected?.period === p.period;
                  const uploadDate = new Date(p.uploadedAt);
                  return (
                    <div key={p.period}
                      className="group relative bg-white rounded-2xl border shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md"
                      style={{ borderColor: isActive ? color : "#e5e7eb", borderWidth: isActive ? "2px" : "1px" }}>

                      {/* Top colour band */}
                      <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${color}, ${color}99)` }} />

                      {/* Card body */}
                      <div className="p-4">
                        {/* Status + Delete */}
                        <div className="flex items-start justify-between mb-3">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: isActive ? color + "20" : "#f0fdf4", color: isActive ? color : "#16a34a" }}>
                            {isActive ? "VIEWING" : "READY"}
                          </span>
                          <button
                            onClick={() => handleDelete(p)}
                            className="opacity-0 group-hover:opacity-100 flex items-center justify-center h-6 w-6 rounded-lg border border-red-200 text-red-400 hover:text-red-600 hover:bg-red-50 transition-all">
                            <Trash2 size={11} />
                          </button>
                        </div>

                        {/* Icon + Period + Filename */}
                        <div className="flex items-center gap-3 mb-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0"
                            style={{ background: iconBg }}>
                            <Icon size={18} style={{ color }} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold leading-tight truncate" style={{ color: BRAND }}>{p.period}</p>
                            {p.fileName && (
                              <p className="text-[10px] font-medium truncate mt-0.5" style={{ color }} title={p.fileName}>
                                📄 {p.fileName}
                              </p>
                            )}
                            {!p.fileName && (
                              <p className="text-[10px] text-gray-400 mt-0.5">{label}</p>
                            )}
                          </div>
                        </div>

                        {/* Metrics */}
                        <div className="grid grid-cols-2 gap-2 mb-4">
                          <div className="rounded-xl px-3 py-2" style={{ background: iconBg }}>
                            <p className="text-[9px] text-gray-400 uppercase tracking-wide mb-0.5">
                              {key === "balance-sheet" ? "Total Assets" : "Total"}
                            </p>
                            <p className="text-xs font-bold font-mono truncate" style={{ color: BRAND }}>
                              {highlight != null
                                ? highlight.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
                                : "—"}
                            </p>
                          </div>
                          <div className="rounded-xl px-3 py-2 bg-gray-50">
                            <p className="text-[9px] text-gray-400 uppercase tracking-wide mb-0.5">Uploaded</p>
                            <p className="text-xs font-semibold text-gray-600 truncate">
                              {uploadDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                            </p>
                          </div>
                        </div>

                        {/* View button */}
                        <button
                          onClick={() => openPeriod(p)}
                          className="w-full py-2 rounded-xl text-xs font-bold transition-all"
                          style={{
                            background: isActive ? color : color + "12",
                            color: isActive ? "#fff" : color,
                            border: `1.5px solid ${color}40`,
                          }}>
                          {isActive ? "▲ Close Report" : "▼ View Report"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Inline report view (shown within History tab when a period is selected) ── */}
          {selected && (
            <div className="space-y-3 mt-2">
              {/* Period info bar */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-4 flex items-center gap-3"
                style={{ borderLeft: `4px solid ${border}` }}>
                <CalendarDays size={18} style={{ color }} />
                <div className="flex-1">
                  <p className="text-base font-bold" style={{ color: BRAND }}>{selected.period}</p>
                  <p className="text-xs text-gray-400">
                    {selected.company} · Uploaded {new Date(selected.uploadedAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}
                  </p>
                </div>
              </div>

              {/* Balance Sheet — BS / CF sub-tabs */}
              {key === "balance-sheet" && (
                <>
                  <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-100 shadow-sm w-fit">
                    {(["bs","cf"] as const).map(t => (
                      <button key={t} onClick={() => setBsTab(t)}
                        className="px-6 py-2 rounded-lg text-sm font-semibold transition-all"
                        style={{ background: bsTab===t ? BRAND : "transparent", color: bsTab===t ? "#fff" : "#6b7280" }}>
                        {t === "bs" ? "Balance Sheet" : "Cash Flow"}
                      </button>
                    ))}
                  </div>
                  {bsTab === "bs" && <ReportTable rows={selected.bs} title={`Balance Sheet — ${selected.period}`} />}
                  {bsTab === "cf" && <ReportTable rows={selected.cf} title={`Cash Flow — ${selected.period}`} />}
                </>
              )}

              {/* Generic report */}
              {key !== "balance-sheet" && (
                <ReportTable
                  rows={selected.rows ?? []}
                  title={`${label} — ${selected.period}`}
                  columns={selected.columns}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* ── REPORT TAB ── */}
      {tab === "report" && (
        <div className="space-y-4">
          {/* Upload zone — always visible at top of report tab */}
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f=e.dataTransfer.files[0]; if(f) processFile(f); }}
            className="flex flex-col items-center gap-3 py-8 rounded-2xl border-2 border-dashed cursor-pointer transition-all"
            style={{ borderColor: drag ? color : "#c7d2fe", background: drag ? iconBg : "#f8faff" }}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{ background: drag ? color : "#e0e7ff" }}>
              <Upload size={22} style={{ color: drag ? "#fff" : BRAND }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold" style={{ color: BRAND }}>
                {uploading ? "Uploading…" : `Upload ${label}`}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Drop an Excel file here or click to browse
                {key === "balance-sheet" && " · Both periods will be saved automatically"}
              </p>
            </div>
            {uploadMsg && (
              <p className={`text-sm font-medium ${uploadMsg.startsWith("✓") ? "text-emerald-600" : "text-red-500"}`}>
                {uploadMsg}
              </p>
            )}
          </div>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={(e) => { const f=e.target.files?.[0]; if(f) processFile(f); e.target.value=""; }} />

          {selected ? (
            <>
              {/* Period info bar */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-4 flex items-center gap-3"
                style={{ borderLeft: `4px solid ${border}` }}>
                <CalendarDays size={20} style={{ color }} />
                <div className="flex-1">
                  <p className="text-base font-bold" style={{ color: BRAND }}>{selected.period}</p>
                  <p className="text-xs text-gray-400">
                    Uploaded {new Date(selected.uploadedAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}
                    &nbsp;· {selected.company}
                  </p>
                </div>
                <button
                  onClick={() => setTab("history")}
                  className="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors">
                  ← History
                </button>
              </div>

              {/* Balance Sheet: BS / CF sub-tabs */}
              {key === "balance-sheet" && (
                <>
                  <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-100 shadow-sm w-fit">
                    {(["bs","cf"] as const).map(t => (
                      <button key={t} onClick={() => setBsTab(t)}
                        className="px-6 py-2 rounded-lg text-sm font-semibold transition-all"
                        style={{ background: bsTab===t ? BRAND : "transparent", color: bsTab===t ? "#fff" : "#6b7280" }}>
                        {t === "bs" ? "Balance Sheet" : "Cash Flow"}
                      </button>
                    ))}
                  </div>
                  {bsTab === "bs" && <ReportTable rows={selected.bs} title={`Balance Sheet — ${selected.period}`} />}
                  {bsTab === "cf" && <ReportTable rows={selected.cf} title={`Cash Flow — ${selected.period}`} />}
                </>
              )}

              {/* Generic report */}
              {key !== "balance-sheet" && (
                <ReportTable
                  rows={selected.rows ?? []}
                  title={`${label} — ${selected.period}`}
                  columns={selected.columns}
                />
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl mb-4"
                style={{ background: iconBg }}>
                <Icon size={26} style={{ color }} />
              </div>
              <p className="text-gray-500 font-medium text-sm">No period selected</p>
              <p className="text-xs text-gray-400 mt-1">Go to <strong>History</strong> and click <strong>View</strong> on a record</p>
              <button onClick={() => setTab("history")}
                className="mt-4 text-xs font-semibold px-4 py-2 rounded-lg transition-all"
                style={{ background: color + "15", color }}>
                ← Go to History
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AccountPage() {
  const router = useRouter();
  const [company,    setCompany]    = useState("diamond-star");
  const [activeType, setActiveType] = useState<typeof REPORT_TYPES[number] | null>(null);

  useEffect(() => {
    function readCompany() {
      try {
        const single = localStorage.getItem("active_company");
        if (single) { setCompany(single.replace(/"/g,"")); return; }
        const multi = localStorage.getItem("selected_companies");
        if (multi) {
          const val = JSON.parse(multi);
          setCompany(Array.isArray(val) ? val[0] : val);
        }
      } catch {}
    }
    readCompany();
    const handler = (e: Event) => {
      const ids = (e as CustomEvent<string[]>).detail;
      if (ids?.length) setCompany(ids[0]);
    };
    window.addEventListener("companiesChanged", handler);
    return () => window.removeEventListener("companiesChanged", handler);
  }, []);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#F4F6FA" }}>

      <header className="w-full flex items-center justify-between px-6 py-3 shadow-md gap-4 z-20"
        style={{ backgroundColor: BRAND }}>
        <Image src="/logo.png" alt="Diamond Star Arabia" width={110} height={65}
          className="object-contain brightness-0 invert" />
        <div className="flex-1 flex justify-center"><CompanySelector single /></div>
        <button onClick={() => router.push("/login")}
          className="flex items-center gap-2 text-white/80 hover:text-white text-sm font-medium transition-colors">
          <LogOut size={16} /> Log out
        </button>
      </header>

      <main className="flex-1 w-full px-4 md:px-8 py-8">
        <div className="mx-auto max-w-4xl space-y-6">

          <nav className="flex items-center gap-1.5 text-xs text-gray-400">
            <Link href="/dashboard" className="hover:text-[#1B3A6B]">Dashboard</Link>
            <ChevronRight size={12} />
            <Link href="/dashboard/finance" className="hover:text-[#1B3A6B]">Finance</Link>
            <ChevronRight size={12} />
            {activeType ? (
              <>
                <button onClick={() => setActiveType(null)} className="hover:text-[#1B3A6B]">Financial Reports</button>
                <ChevronRight size={12} />
                <span className="text-gray-600 font-medium">{activeType.label}</span>
              </>
            ) : (
              <span className="text-gray-600 font-medium">Financial Reports</span>
            )}
          </nav>

          {activeType ? (
            <ReportTypeView
              company={company}
              reportType={activeType}
              onBack={() => setActiveType(null)}
            />
          ) : (
            <>
              {/* Page header */}
              <div className="flex items-center gap-4 pb-2 border-b border-gray-200">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl text-white shrink-0"
                  style={{ background: `linear-gradient(135deg,${BRAND},#2a5a9e)` }}>
                  <FileBarChart size={24} />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-800">Financial Reports</h1>
                  <p className="text-sm text-gray-400">Financial accounting modules</p>
                </div>
              </div>

              {/* Cards grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {REPORT_TYPES.map((rt) => (
                  <button
                    key={rt.key}
                    onClick={() => setActiveType(rt)}
                    className="group flex items-center gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 text-left hover:shadow-md transition-all"
                    style={{ borderLeft: `4px solid ${rt.border}` }}
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl flex-shrink-0"
                      style={{ background: rt.iconBg }}>
                      <rt.Icon size={22} style={{ color: rt.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-800">{rt.label}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: "#dcfce7", color: "#16a34a" }}>
                          READY
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{rt.description}</p>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 group-hover:text-gray-500 flex-shrink-0 transition-colors" />
                  </button>
                ))}
              </div>
            </>
          )}

        </div>
      </main>
    </div>
  );
}
