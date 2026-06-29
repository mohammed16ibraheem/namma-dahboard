"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight, LogOut, Upload, FileSpreadsheet,
  Trash2, CalendarDays, Info, TrendingUp,
  ArrowDownUp, Receipt, FileBarChart, Landmark, Scale,
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
    key: "trial-balance"      as ReportType,
    label: "Trial Balance",
    description: "Upload and view trial balance reports",
    Icon: Scale,
    color: "#0F766E",
    border: "#0F766E",
    iconBg: "#F0FDFA",
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

// Parse text dates like "31-May-2025", "31 May 2025", "31/May/2025", "31-May-25"
const MONTH_MAP_TXT: Record<string, string> = {
  jan:"Jan",feb:"Feb",mar:"Mar",apr:"Apr",may:"May",jun:"Jun",
  jul:"Jul",aug:"Aug",sep:"Sep",oct:"Oct",nov:"Nov",dec:"Dec"
};
function parseTextDate(text: string): string | null {
  const m = String(text).match(/(\d{1,2})[-\/\s]([A-Za-z]{3,9})[-\/\s](\d{2,4})/);
  if (m) {
    const mon = MONTH_MAP_TXT[m[2].slice(0,3).toLowerCase()];
    if (!mon) return null;
    const yr = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${String(m[1]).padStart(2,"0")}-${mon}-${yr}`;
  }
  return null;
}

// Extract a date string from any cell value (serial OR text, handles multi-line cells and DD-MM-YYYY)
function cellToDate(cell: unknown): string | null {
  if (typeof cell === "number" && cell > 40000 && cell < 55000) {
    try { return excelDateToStr(cell); } catch {}
  }
  if (typeof cell === "string") {
    // Try text-month format first: "31-May-2025"
    for (const part of cell.split(/[\r\n]+/)) {
      const d = parseTextDate(part.trim());
      if (d) return d;
    }
    // Try numeric DD-MM-YYYY format (e.g. "Trial Balance 01-01-2026 To 31-05-2026")
    // Return the LAST date found so "X To 31-05-2026" picks up the period END date
    const numDates: string[] = [];
    const re = /(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/g;
    let m;
    while ((m = re.exec(cell)) !== null) {
      const dd = parseInt(m[1]), mo = parseInt(m[2]), yr = m[3];
      if (dd >= 1 && dd <= 31 && mo >= 1 && mo <= 12) {
        numDates.push(`${String(dd).padStart(2,"0")}-${MONTHS[mo-1]}-${yr}`);
      }
    }
    if (numDates.length) return numDates[numDates.length - 1];
  }
  return null;
}

function findFirstDateSerial(rows: unknown[][], maxRow = 8): string {
  for (let i = 0; i < Math.min(maxRow, rows.length); i++) {
    for (const cell of rows[i] as (string | number)[]) {
      const d = cellToDate(cell);
      if (d) return d;
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
    upper.startsWith("TOTAL") ||
    upper.startsWith("GROSS PROFIT") || upper.startsWith("GROSSS PROFIT") ||
    upper.startsWith("NET PROFIT") || upper.startsWith("NET INCOME") ||
    upper.startsWith("NET LOSS") || upper.startsWith("NET CASH") ||
    upper.startsWith("NET CHANGE IN CASH") ||
    upper === "CLOSING CASH AND BANK" || upper.startsWith("CLOSING CASH") ||
    upper.startsWith("TOTAL EXPENSES") || upper.startsWith("TOTAL INCOME") ||
    upper.startsWith("CASH FROM OPERATIONS") || upper.startsWith("CASH FROM INVESTING") ||
    upper.startsWith("CASH FROM FINANCING")
  ) {
    type = "total";
  } else if (spaces <= 1) {
    type = "section";
  } else {
    type = "line";
  }
  const indent = spaces <= 1 ? 0 : Math.floor((spaces - 1) / 4);
  return { label, indent, type };
}

/** Returns true if this sheet looks like a trial balance — prevents it being parsed as P&L/CF. */
function isLikelyTrialBalance(rows: unknown[][]): boolean {
  for (let ri = 0; ri < Math.min(8, rows.length); ri++) {
    const text = (rows[ri] as unknown[]).map(c => String(c ?? "").toLowerCase()).join(" ");
    if (
      text.includes("closing balance") ||
      (text.includes("opening balance") && text.includes("debit")) ||
      (text.includes("debits") && text.includes("credits"))
    ) return true;
  }
  return false;
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
 * Parses a Trial Balance sheet with columns:
 *   Code | Account | Opening Balance | Debits | Credits | Net Change | Closing Balance | Account Group
 * Returns PeriodFile[] with rows[] + columns[] for multi-column display.
 * Automatically inserts "Total — <Section>" rows after each section group.
 */
function parseTBReport(rows: unknown[][], company: string): PeriodFile[] {
  // 1. Find header row containing "Opening Balance" and "Debits"
  let headerIdx = -1, codeCol = -1, labelCol = -1;
  let openingCol = -1, debitsCol = -1, creditsCol = -1, netChangeCol = -1, closingCol = -1;

  for (let ri = 0; ri < Math.min(8, rows.length); ri++) {
    const cells = (rows[ri] as (string | number)[]).map(c => String(c ?? "").toLowerCase().trim());
    const find = (...terms: string[]) => {
      for (const t of terms) {
        const i = cells.indexOf(t);
        if (i >= 0) return i;
      }
      return -1;
    };
    const ob = find("opening balance", "opening");
    const db = find("debits", "debit");
    const cl = find("closing balance", "closing");
    if (ob >= 0 && db >= 0 && cl >= 0) {
      openingCol  = ob;
      debitsCol   = db;
      creditsCol  = find("credits", "credit");
      netChangeCol= find("net change", "movement", "change");
      closingCol  = cl;
      labelCol    = find("account", "account name", "accounts", "description");
      codeCol     = find("code", "acc code", "account code");
      if (labelCol < 0) labelCol = ob - 1;
      if (codeCol < 0)  codeCol  = labelCol - 1;
      headerIdx = ri;
      break;
    }
  }
  if (headerIdx < 0 || closingCol < 0) return [];

  // 2. Detect period from title rows
  let period = todayStr();
  for (let ri = 0; ri < Math.min(4, rows.length); ri++) {
    for (const cell of rows[ri] as unknown[]) {
      const d = cellToDate(cell);
      if (d && d !== todayStr()) { period = d; break; }
    }
    if (period !== todayStr()) break;
  }

  // 3. Parse each data row
  const toNum = (v: unknown): number | null => {
    if (typeof v === "number") return isFinite(v) ? v : null;
    const n = parseFloat(String(v ?? ""));
    return isFinite(n) ? n : null;
  };

  type RawTB = {
    code: string; label: string; indent: number; isSection: boolean;
    opening: number | null; debits: number | null; credits: number | null;
    netChange: number | null; closing: number | null;
  };

  const parsed: RawTB[] = [];
  for (let ri = headerIdx + 1; ri < rows.length; ri++) {
    const row = rows[ri] as (string | number)[];
    const rawLabel = String(row[labelCol] ?? "");
    if (!rawLabel.trim()) continue;

    const code    = String(row[codeCol] ?? "").trim();
    const spaces  = rawLabel.length - rawLabel.trimStart().length;
    const label   = rawLabel.trim();
    const opening = toNum(row[openingCol]);
    const debits  = toNum(row[debitsCol]);
    const credits = creditsCol >= 0 ? toNum(row[creditsCol]) : null;
    const nc      = netChangeCol >= 0 ? toNum(row[netChangeCol]) : null;
    const closing = toNum(row[closingCol]);
    const hasData = opening !== null || debits !== null || credits !== null || closing !== null;
    // Sections: no numeric data, or only zeros with large indented code pattern
    const isSection = !hasData || (debits === 0 && credits === 0 && closing === 0 && opening === 0 && spaces < 4);

    parsed.push({ code, label, indent: Math.min(Math.floor(spaces / 4), 3), isSection, opening, debits, credits, netChange: nc, closing });
  }
  if (!parsed.length) return [];

  // 4. Build ReportRow[] with section totals
  type SectionEntry = {
    label: string; indent: number;
    totals: [number|null, number|null, number|null, number|null, number|null];
  };
  const stack: SectionEntry[] = [];
  const reportRows: ReportRow[] = [];

  const nullAdd = (a: number|null, b: number|null) =>
    a === null && b === null ? null : (a ?? 0) + (b ?? 0);

  const flushSection = (sec: SectionEntry) => {
    const [op, db, cr, nc, cl] = sec.totals;
    if (db !== null || cr !== null || cl !== null) {
      reportRows.push({
        label: `Total  ${sec.label}`,
        type: "total",
        indent: sec.indent,
        value: cl,
        values: [op, db, cr, nc, cl],
      });
    }
  };

  for (let i = 0; i < parsed.length; i++) {
    const row = parsed[i];
    // Close any open sections at same or higher indent level
    while (stack.length > 0 && stack[stack.length - 1].indent >= row.indent && row.isSection) {
      flushSection(stack.pop()!);
    }

    const displayLabel = row.code ? `${row.code}   ${row.label}` : row.label;

    if (row.isSection) {
      reportRows.push({ label: displayLabel, type: "section", indent: row.indent, value: null, values: [null,null,null,null,null] });
      stack.push({ label: row.label, indent: row.indent, totals: [null,null,null,null,null] });
    } else {
      reportRows.push({
        label: displayLabel,
        type: "line",
        indent: row.indent,
        value: row.closing,
        values: [row.opening, row.debits, row.credits, row.netChange, row.closing],
      });
      // Accumulate into ALL open parent sections
      for (const sec of stack) {
        sec.totals[0] = nullAdd(sec.totals[0], row.opening);
        sec.totals[1] = nullAdd(sec.totals[1], row.debits);
        sec.totals[2] = nullAdd(sec.totals[2], row.credits);
        sec.totals[3] = nullAdd(sec.totals[3], row.netChange);
        sec.totals[4] = nullAdd(sec.totals[4], row.closing);
      }
    }
  }
  // Flush remaining open sections
  while (stack.length) flushSection(stack.pop()!);

  return [{
    reportType: "trial-balance",
    period,
    company,
    uploadedAt: new Date().toISOString(),
    bs: [],
    cf: [],
    rows: reportRows,
    columns: ["Opening Balance", "Debits", "Credits", "Net Change", "Closing Balance"],
  }];
}

/**
 * Parses a sheet that has Balance Sheet on the LEFT and Cash Flow on the RIGHT.
 * Handles text dates like "31-May-2025" / "31-Dec-2025".
 * Returns { bsPeriods, cfPeriods } — caller saves each to its own report type.
 */
function parseBsCfSideBySide(rows: unknown[][], company: string): { bsPeriods: PeriodFile[]; cfPeriods: PeriodFile[] } {
  const empty = { bsPeriods: [], cfPeriods: [] };

  // Step 1: find CF start column (scan first 5 rows for "cash flow" / "operating activities")
  let cfLabelCol = -1;
  for (let ri = 0; ri < Math.min(5, rows.length); ri++) {
    const row = rows[ri] as (string | number)[];
    for (let ci = 4; ci < row.length; ci++) {
      const v = String(row[ci] ?? "").toLowerCase().trim();
      if (v.includes("cash flow") || v.includes("operating activities")) {
        cfLabelCol = ci; break;
      }
    }
    if (cfLabelCol >= 0) break;
  }
  if (cfLabelCol < 0) return empty;

  // Step 2: scan header rows (first 8) to collect column → date mappings
  type ColDate = { col: number; date: string };
  const allColDates: ColDate[] = [];
  let headerRowIdx = -1;

  for (let ri = 0; ri < Math.min(8, rows.length); ri++) {
    const row = rows[ri] as (string | number)[];
    const found: ColDate[] = [];
    for (let ci = 0; ci < row.length; ci++) {
      const d = cellToDate(row[ci]);
      if (d) found.push({ col: ci, date: d });
    }
    if (found.length >= 1) { allColDates.push(...found); headerRowIdx = ri; break; }
  }
  if (!allColDates.length) return empty;

  const bsColDates = allColDates.filter(d => d.col < cfLabelCol);
  const cfColDates = allColDates.filter(d => d.col > cfLabelCol);
  if (!bsColDates.length) return empty;

  const bsLabelCol = 1; // col B
  const dataStart  = headerRowIdx >= 0 ? headerRowIdx + 1 : 5;
  const now        = new Date().toISOString();

  const bsData: BsRow[][] = bsColDates.map(() => []);
  const cfData: CfRow[][] = cfColDates.map(() => []);

  for (let ri = dataStart; ri < rows.length; ri++) {
    const row = rows[ri] as (string | number | null)[];

    const bsRaw = String(row[bsLabelCol] ?? "");
    if (bsRaw.trim()) {
      const { label, indent, type } = parseRawLabel(bsRaw);
      bsColDates.forEach(({ col }, pi) => {
        const v = row[col];
        const n = (v !== "" && v !== null && v !== undefined) ? (typeof v === "number" ? v : parseFloat(String(v))) : null;
        const val = (n !== null && Number.isFinite(n)) ? n : null;
        const eff: "section"|"line"|"total" = (type === "section" && val !== null) ? "line" : type;
        bsData[pi].push({ label, indent, value: val, type: eff });
      });
    }

    if (cfLabelCol >= 0) {
      const cfRaw = String(row[cfLabelCol] ?? "");
      if (cfRaw.trim()) {
        const { label, indent, type } = parseRawLabel(cfRaw);
        cfColDates.forEach(({ col }, pi) => {
          const v = row[col];
          const n = (v !== "" && v !== null && v !== undefined) ? (typeof v === "number" ? v : parseFloat(String(v))) : null;
          const val = (n !== null && Number.isFinite(n)) ? n : null;
          const eff: "section"|"line"|"total" = (type === "section" && val !== null) ? "line" : type;
          cfData[pi].push({ label, indent, value: val, type: eff });
        });
      }
    }
  }

  // Add section totals if not already present in the Excel data
  const bsWithTotals = bsData.map(arr => arr.some(r=>r.type==="total") ? arr : addSingleSectionTotals(arr) as BsRow[]);
  const cfWithTotals = cfData.map(arr => arr.some(r=>r.type==="total") ? arr : addSingleSectionTotals(arr) as CfRow[]);

  const bsPeriods: PeriodFile[] = bsColDates
    .map(({ date }, pi) => bsWithTotals[pi].length
      ? { reportType: "balance-sheet" as ReportType, period: date, company, uploadedAt: now,
          bs: bsWithTotals[pi], cf: cfColDates[pi] ? cfWithTotals[pi] : [] }
      : null)
    .filter(Boolean) as PeriodFile[];

  const cfPeriods: PeriodFile[] = cfColDates
    .map(({ date }, pi) => cfWithTotals[pi].length
      ? { reportType: "cash-flow" as ReportType, period: date, company, uploadedAt: now,
          bs: [], cf: [],
          rows: cfWithTotals[pi].map(r => ({ label: r.label, indent: r.indent, value: r.value, values: [r.value], type: r.type })),
          columns: ["Total"] }
      : null)
    .filter(Boolean) as PeriodFile[];

  return { bsPeriods, cfPeriods };
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

  // Detect code column: check header row for "Code" in the column before labelCol
  let codeCol = -1;
  if (labelCol > 0) {
    for (let ri = 0; ri < Math.min(8, rows.length); ri++) {
      const v = String((rows[ri] as unknown[])[labelCol - 1] ?? "").toLowerCase().trim();
      if (v === "code" || v === "acc code" || v === "account code") { codeCol = labelCol - 1; break; }
    }
  }

  const dataRows: ReportRow[] = [];
  rows.slice(dataStart).forEach(r => {
    const row = r as (string | number | null | undefined)[];
    const raw = String(row[labelCol] ?? "");
    if (!raw.trim() || /^\d+(\.\d+)?$/.test(raw.trim())) return;
    const { label, indent, type } = parseRawLabel(raw);

    // Include account code in label if present
    const code = codeCol >= 0 ? String(row[codeCol] ?? "").trim() : "";
    const displayLabel = code && !/^(total|sub|grand)/i.test(label.trim()) ? `${code}   ${label}` : label;

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
    const effectiveType = (type === "section" && values.some(v => v !== null)) ? "line" : type;
    dataRows.push({ label: displayLabel, indent, value, values, type: effectiveType });
  });

  if (!dataRows.length) return [];

  // Insert section totals if the Excel doesn't already have them
  const hasTotals = dataRows.some(r => r.type === "total");
  const finalRows = hasTotals ? dataRows : addMultiSectionTotals(dataRows, numCols);

  return [{
    reportType, period, company,
    uploadedAt: new Date().toISOString(),
    bs: [], cf: [], rows: finalRows, columns,
  }];
}

// ─── Section-total helpers ────────────────────────────────────────────────────

/** Insert "Total — X" rows after each section group (multi-column rows). */
function addMultiSectionTotals(rows: ReportRow[], nCols: number): ReportRow[] {
  if (!rows.length) return rows;
  type SE = { label: string; indent: number; sums: (number|null)[] };
  const stack: SE[] = [];
  const result: ReportRow[] = [];
  const na = (a: number|null, b: number|null) => a===null&&b===null?null:(a??0)+(b??0);

  for (const row of rows) {
    if (row.type === "section") {
      while (stack.length && stack[stack.length-1].indent >= (row.indent??0)) {
        const t = stack.pop()!;
        if (t.sums.some(s=>s!==null))
          result.push({ label:`Total  ${t.label}`, type:"total", indent:t.indent, value:t.sums[0], values:t.sums });
      }
    }
    result.push(row);
    if (row.type === "section") stack.push({ label:row.label, indent:row.indent??0, sums:new Array(nCols).fill(null) });
    else if (row.type === "line" && row.values) {
      for (const s of stack)
        for (let j=0;j<nCols;j++) { const v=row.values[j]; if(v!==null&&v!==undefined) s.sums[j]=na(s.sums[j],v); }
    }
  }
  while (stack.length) {
    const t = stack.pop()!;
    if (t.sums.some(s=>s!==null))
      result.push({ label:`Total  ${t.label}`, type:"total", indent:t.indent, value:t.sums[0], values:t.sums });
  }
  return result;
}

/** Insert "Total — X" rows after each section group (single-value rows). */
function addSingleSectionTotals(rows: (BsRow|CfRow|ReportRow)[]): (BsRow|CfRow|ReportRow)[] {
  if (!rows.length) return rows;
  type SE = { label:string; indent:number; sum:number|null };
  const stack: SE[] = [];
  const result: (BsRow|CfRow|ReportRow)[] = [];

  for (const row of rows) {
    if (row.type === "section") {
      while (stack.length && stack[stack.length-1].indent >= (row.indent??0)) {
        const t = stack.pop()!;
        if (t.sum !== null) result.push({ label:`Total  ${t.label}`, type:"total", indent:t.indent, value:t.sum });
      }
    }
    result.push(row);
    if (row.type === "section") stack.push({ label:row.label, indent:row.indent??0, sum:null });
    else if (row.type === "line" && row.value !== null) for (const s of stack) s.sum=(s.sum??0)+row.value;
  }
  while (stack.length) {
    const t = stack.pop()!;
    if (t.sum !== null) result.push({ label:`Total  ${t.label}`, type:"total", indent:t.indent, value:t.sum });
  }
  return result;
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

  /* ── Multi-column table (P&L / Trial Balance) ── */
  if (isMulti) {
    return <MultiColTable rows={rows as ReportRow[]} title={title} columns={columns} />;
  }

  /* ── Single-column table (Balance Sheet, Trial Balance) ── */
  return <SingleColTable rows={rows} title={title} />;
}

const PAGE_SIZE = 60;

function MultiColTable({ rows: rawRows, title, columns }: { rows: ReportRow[]; title: string; columns: string[] }) {
  const [search, setSearch] = React.useState("");
  const [page, setPage]     = React.useState(0);
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());

  // Add section totals at render time if parser didn't already include them
  const rows = useMemo(
    () => rawRows.some(r=>r.type==="total") ? rawRows : addMultiSectionTotals(rawRows, columns.length),
    [rawRows, columns.length]
  );

  // ALL section labels are collapsible (any indent level)
  const allSectionLabels = useMemo(
    () => new Set(rows.filter(r => r.type === "section").map(r => r.label)),
    [rows]
  );

  // Default: ALL sections start collapsed — user clicks to expand
  React.useEffect(() => {
    setCollapsed(new Set(rows.filter(r => r.type === "section").map(r => r.label)));
  }, [rows]);

  const toggleSection = (label: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  };

  const allCollapsed = allSectionLabels.size > 0 && collapsed.size >= allSectionLabels.size;

  const lq = search.toLowerCase().trim();
  const isBig = rows.length > PAGE_SIZE;

  // Search mode: show matching lines (ignores collapse)
  const searchFiltered = useMemo(() => {
    if (!lq) return [];
    const out: ReportRow[] = [];
    let lastSection: ReportRow | null = null;
    for (const row of rows) {
      if (row.type === "section")  { lastSection = row; continue; }
      if (row.type === "total")    { continue; }
      if (row.label.toLowerCase().includes(lq)) {
        if (lastSection && !out.includes(lastSection)) out.push(lastSection);
        out.push(row);
      }
    }
    return out;
  }, [rows, lq]);

  // Tree-collapse: when a section at indent=N is collapsed, hide everything with
  // indent>N until a section/total at indent≤N brings us back out.
  const visibleRows = useMemo(() => {
    if (lq) return searchFiltered;
    const out: ReportRow[] = [];
    let hiddenDepth: number | null = null;
    for (const row of rows) {
      const d = row.indent ?? 0;
      if (row.type === "section") {
        if (hiddenDepth !== null && d <= hiddenDepth) hiddenDepth = null;
        if (hiddenDepth !== null) continue;
        out.push(row);
        if (collapsed.has(row.label)) hiddenDepth = d;
      } else if (row.type === "total") {
        if (hiddenDepth !== null && d <= hiddenDepth) hiddenDepth = null;
        if (hiddenDepth !== null) continue;
        out.push(row);
      } else {
        if (hiddenDepth !== null) continue;
        out.push(row);
      }
    }
    return out;
  }, [rows, lq, collapsed, searchFiltered]);

  const totalPages = Math.ceil(visibleRows.length / PAGE_SIZE);
  const visible    = lq ? searchFiltered : visibleRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  React.useEffect(() => setPage(0), [lq]);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-white flex items-center justify-between"
        style={{ background: BRAND }}>
        <span>{title}</span>
        <span className="flex items-center gap-3">
          <span className="text-white/60 font-normal normal-case text-[10px]">
            {rows.filter(r => r.type === "line").length} accounts{isBig && !lq ? ` · page ${page + 1}/${totalPages}` : ""}
          </span>
          {allSectionLabels.size > 0 && (
            <button
              onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(allSectionLabels))}
              className="text-white/70 hover:text-white text-[10px] font-semibold normal-case transition-colors px-2 py-0.5 rounded border border-white/20 hover:border-white/50">
              {allCollapsed ? "Expand all" : "Collapse all"}
            </button>
          )}
        </span>
      </div>

      {/* Search */}
      {isBig && (
        <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
          <Info size={13} className="text-gray-400 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search accounts or codes…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 text-[12px] bg-transparent outline-none text-gray-700 placeholder-gray-400"
          />
          {search && (
            <button onClick={() => setSearch("")}
              className="text-gray-400 hover:text-gray-600 text-[11px] px-1.5">✕</button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] border-collapse" style={{ minWidth: `${240 + columns.length * 120}px` }}>
          <thead>
            <tr style={{ background: "#EEF2F9", borderBottom: `2px solid ${BRAND}` }}>
              <th className="text-left py-2.5 px-5 font-bold sticky left-0 bg-[#EEF2F9] z-10"
                style={{ color: BRAND, minWidth: "260px" }}>Account</th>
              {columns.map((col, ci) => (
                <th key={ci} className="text-right py-2.5 px-3 font-bold whitespace-nowrap"
                  style={{ color: BRAND, minWidth: "110px" }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="py-10 text-center text-sm text-gray-400">No matching accounts</td></tr>
            )}
            {visible.map((row, i) => {
              const vals = row.values ?? [row.value];
              const indentPx = INDENT_PX[Math.min(row.indent ?? 0, INDENT_PX.length - 1)];
              const isRowCollapsed = row.type === "section" && collapsed.has(row.label);

              if (row.type === "section") return (
                <tr key={i}
                  onClick={() => toggleSection(row.label)}
                  style={{
                    background: indentPx === 0 ? "#EEF2F9" : "#F5F7FC",
                    borderTop: "1px solid #d1dcea",
                    cursor: "pointer",
                  }}>
                  <td colSpan={columns.length + 1}
                    className="py-2 font-bold uppercase text-[10px] tracking-widest select-none hover:bg-blue-50/40 transition-colors"
                    style={{ paddingLeft: `${20 + indentPx}px`, color: BRAND }}>
                    <div className="flex items-center gap-1.5">
                      <ChevronRight size={12} className="flex-shrink-0 transition-transform duration-150"
                        style={{ transform: isRowCollapsed ? "rotate(0deg)" : "rotate(90deg)", color: BRAND, opacity: 0.7 }} />
                      {row.label}
                    </div>
                  </td>
                </tr>
              );

              if (row.type === "total") return (
                <tr key={i} style={{ background: "#f0f4fa", borderTop: "2px solid #d1dcea", borderBottom: "2px solid #d1dcea" }}>
                  <td className="py-2.5 font-bold text-gray-700 sticky left-0 bg-[#f0f4fa]"
                    style={{ paddingLeft: `${20 + indentPx}px`, color: BRAND, fontSize: "11px" }}>
                    {row.label}
                  </td>
                  {vals.map((v, vi) => (
                    <td key={vi} className="text-right py-2.5 px-3 font-bold font-mono tabular-nums text-[11px]"
                      style={{ color: (v ?? 0) < 0 ? "#ef4444" : BRAND }}>
                      {fmt(v)}
                    </td>
                  ))}
                </tr>
              );

              return (
                <tr key={i} className="border-b border-gray-50 hover:bg-blue-50/30 transition-colors"
                  style={{ background: i % 2 === 0 ? "#fff" : "#fafbfc" }}>
                  <td className="py-1.5 text-gray-600 sticky left-0 hover:bg-blue-50/30"
                    style={{ paddingLeft: `${20 + indentPx}px`, background: "inherit" }}>
                    {row.label}
                  </td>
                  {vals.map((v, vi) => (
                    <td key={vi} className="text-right py-1.5 px-3 font-mono tabular-nums text-[11px]"
                      style={{ color: (v ?? 0) < 0 ? "#ef4444" : (v ?? 0) === 0 ? "#d1d5db" : "#374151" }}>
                      {fmt(v)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {isBig && !lq && totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="text-[11px] px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-30 hover:bg-white transition-colors">
            ← Previous
          </button>
          <span className="text-[11px] text-gray-400">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, visibleRows.length)} of {visibleRows.length}
          </span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
            className="text-[11px] px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-30 hover:bg-white transition-colors">
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

function SingleColTable({ rows: rawRows, title }: { rows: (BsRow | CfRow | ReportRow)[]; title: string }) {
  const [search, setSearch] = React.useState("");
  const [page,   setPage]   = React.useState(0);
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());

  // Add section totals at render time if data doesn't already include them
  const rows = useMemo(
    () => rawRows.some(r=>r.type==="total") ? rawRows : addSingleSectionTotals(rawRows),
    [rawRows]
  );

  // ALL section labels are collapsible (any indent level)
  const allSectionLabels = useMemo(
    () => new Set(rows.filter(r => r.type === "section").map(r => r.label)),
    [rows]
  );

  // Default: ALL sections start collapsed — user clicks to expand
  React.useEffect(() => {
    setCollapsed(new Set(rows.filter(r => r.type === "section").map(r => r.label)));
  }, [rows]);

  const toggleSection = (label: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  };

  const allCollapsed = allSectionLabels.size > 0 && collapsed.size >= allSectionLabels.size;

  const lq = search.toLowerCase().trim();
  const isBig = rows.length > PAGE_SIZE;

  // Search mode: show matching lines (ignores collapse)
  const searchFiltered = React.useMemo(() => {
    if (!lq) return [];
    const out: typeof rows = [];
    let lastSection: typeof rows[0] | null = null;
    for (const row of rows) {
      if (row.type === "section") { lastSection = row; continue; }
      if (row.label.toLowerCase().includes(lq) || String(row.value ?? "").includes(lq)) {
        if (lastSection && !out.includes(lastSection)) out.push(lastSection);
        out.push(row);
      }
    }
    return out;
  }, [rows, lq]);

  // Tree-collapse: when a section at indent=N is collapsed, hide everything with
  // indent>N until a section/total at indent≤N brings us back out.
  const visibleRows = useMemo(() => {
    if (lq) return searchFiltered;
    const out: typeof rows = [];
    let hiddenDepth: number | null = null;
    for (const row of rows) {
      const d = row.indent ?? 0;
      if (row.type === "section") {
        if (hiddenDepth !== null && d <= hiddenDepth) hiddenDepth = null;
        if (hiddenDepth !== null) continue;
        out.push(row);
        if (collapsed.has(row.label)) hiddenDepth = d;
      } else if (row.type === "total") {
        if (hiddenDepth !== null && d <= hiddenDepth) hiddenDepth = null;
        if (hiddenDepth !== null) continue;
        out.push(row);
      } else {
        if (hiddenDepth !== null) continue;
        out.push(row);
      }
    }
    return out;
  }, [rows, lq, collapsed, searchFiltered]);

  const totalPages = Math.ceil(visibleRows.length / PAGE_SIZE);
  const visible    = lq ? searchFiltered : visibleRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  React.useEffect(() => setPage(0), [lq]);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-white flex items-center justify-between"
        style={{ background: BRAND }}>
        <span>{title}</span>
        <span className="flex items-center gap-3">
          <span className="text-white/60 font-normal normal-case text-[10px]">
            {rows.filter(r => r.type === "line").length} rows{isBig && !lq ? ` · page ${page + 1}/${totalPages}` : ""}
          </span>
          {allSectionLabels.size > 0 && (
            <button
              onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(allSectionLabels))}
              className="text-white/70 hover:text-white text-[10px] font-semibold normal-case transition-colors px-2 py-0.5 rounded border border-white/20 hover:border-white/50">
              {allCollapsed ? "Expand all" : "Collapse all"}
            </button>
          )}
          <span>SAR</span>
        </span>
      </div>

      {/* Search bar — only shown when table is large */}
      {isBig && (
        <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
          <Info size={13} className="text-gray-400 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search accounts…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 text-[12px] bg-transparent outline-none text-gray-700 placeholder-gray-400"
          />
          {search && (
            <button onClick={() => setSearch("")}
              className="text-gray-400 hover:text-gray-600 text-[11px] px-1.5">✕</button>
          )}
        </div>
      )}

      {/* Rows */}
      <div>
        {visible.length === 0 && (
          <div className="py-10 text-center text-sm text-gray-400">No matching accounts</div>
        )}
        {visible.map((row, i) => {
          const indentPx     = INDENT_PX[Math.min(row.indent ?? 0, INDENT_PX.length - 1)];
          const isNeg        = (row.value ?? 0) < 0;
          const isRowCollapsed = row.type === "section" && collapsed.has(row.label);

          if (row.type === "section") return (
            <div key={i}
              onClick={() => toggleSection(row.label)}
              className="py-2 text-[11px] font-bold uppercase tracking-widest flex items-center justify-between select-none cursor-pointer hover:bg-blue-50/40 transition-colors"
              style={{
                paddingLeft: `${20 + indentPx}px`, paddingRight: "20px",
                color: BRAND,
                background: indentPx === 0 ? "#EEF2F9" : "#F5F7FC",
                borderTop: "1px solid #d1dcea",
              }}>
              <span className="flex items-center gap-1.5">
                <ChevronRight size={12} className="flex-shrink-0 transition-transform duration-150"
                  style={{ transform: isRowCollapsed ? "rotate(0deg)" : "rotate(90deg)", color: BRAND, opacity: 0.7 }} />
                {row.label}
              </span>
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
              style={{ paddingLeft: `${20 + indentPx}px`, paddingRight: "20px", background: i % 2 === 0 ? "#fff" : "#fafbfc" }}>
              <span className="flex-1 text-gray-600">{row.label}</span>
              <span className="font-mono tabular-nums text-[11px]"
                style={{ color: isNeg ? "#ef4444" : (row.value ?? 0) === 0 ? "#d1d5db" : "#374151" }}>
                {fmt(row.value)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Pagination — only when not searching and table is large */}
      {isBig && !lq && totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="text-[11px] px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-30 hover:bg-white transition-colors">
            ← Previous
          </button>
          <span className="text-[11px] text-gray-400">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, visibleRows.length)} of {visibleRows.length}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="text-[11px] px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-30 hover:bg-white transition-colors">
            Next →
          </button>
        </div>
      )}
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
        const wb       = XLSX.read(e.target?.result, { type: "array" });
        const fileName = file.name.replace(/\.[^.]+$/, "");

        // Collect periods across ALL sheets and ALL detected report types
        const byType: Partial<Record<ReportType, PeriodFile[]>> = {};
        const add = (type: ReportType, items: PeriodFile[]) => {
          if (!byType[type]) byType[type] = [];
          byType[type]!.push(...items);
        };

        for (const sheetName of wb.SheetNames) {
          const ws   = wb.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });

          // Try side-by-side BS+CF layout first (handles "bs and cf" style sheets)
          const bsCf = parseBsCfSideBySide(rows, company);
          if (bsCf.bsPeriods.length || bsCf.cfPeriods.length) {
            add("balance-sheet", bsCf.bsPeriods);
            add("cash-flow",     bsCf.cfPeriods);
          } else if (key === "trial-balance") {
            const tbParsed = parseTBReport(rows, company);
            if (tbParsed.length) add("trial-balance", tbParsed);
            else add("trial-balance", parseBalanceSheet(rows, company)); // fallback
          } else if (key === "balance-sheet") {
            add(key, parseBalanceSheet(rows, company));
          } else if (!isLikelyTrialBalance(rows)) {
            // Other types: never try to parse a trial balance as P&L / CF / etc.
            add(key, parseGenericReport(rows, company, key));
          }
        }

        // Dedup within each type by period
        for (const type of Object.keys(byType) as ReportType[]) {
          const seen = new Set<string>();
          byType[type] = byType[type]!.filter(p => {
            if (seen.has(p.period)) return false;
            seen.add(p.period); return true;
          });
        }

        const targetPeriods = byType[key] ?? [];
        if (!targetPeriods.length) {
          setUploadMsg("No data found in this file."); setUploading(false); return;
        }

        // Generate ONE upload folder for this entire file upload batch
        const uploadFolder = new Date().toISOString().slice(0, 19).replace("T", "_").replace(/:/g, "-");

        // Save ALL found report types (one upload can populate BS + CF at once)
        let savedTarget = 0;
        const savedTypes = new Set<string>();
        for (const [type, periods] of Object.entries(byType)) {
          for (const p of periods ?? []) {
            p.fileName     = fileName;
            p.reportType   = type as ReportType;
            p.uploadFolder = uploadFolder;
            const res = await fetch("/api/account", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(p),
            });
            if (res.ok) savedTypes.add(type);
            if (res.ok && type === key) savedTarget++;
          }
        }

        // Save original Excel file into the SAME timestamped folder
        for (const type of savedTypes) {
          const fd = new FormData();
          fd.append("file",         file);
          fd.append("company",      company);
          fd.append("type",         type);
          fd.append("uploadFolder", uploadFolder);
          await fetch("/api/account/file", { method: "POST", body: fd });
        }

        setUploadMsg(`✓ ${savedTarget} period${savedTarget>1?"s":""} saved`);
        await fetchPeriods();
        if (targetPeriods.length > 0) { openPeriod(targetPeriods[0]); }
      } catch { setUploadMsg("Could not read file."); }
      setUploading(false);
    };
    reader.readAsArrayBuffer(file);
  }, [company, key, fetchPeriods]);

  const handleDelete = async (period: PeriodFile) => {
    const folderParam = period.uploadFolder ? `&uploadFolder=${encodeURIComponent(period.uploadFolder)}` : "";
    await fetch(
      `/api/account?company=${period.company}&period=${encodeURIComponent(period.period)}&type=${key}${folderParam}`,
      { method: "DELETE" }
    );
    if (selected?.period === period.period) { setSelected(null); setTab("history"); }
    await fetchPeriods();
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
                      : key === "trial-balance"
                      ? (() => {
                          // New format: sum debits column (values[1]) from line rows
                          if (p.rows?.length) {
                            const v = p.rows.filter(r => r.type === "line").reduce((s, r) => s + ((r.values?.[1] ?? 0) > 0 ? (r.values?.[1] ?? 0) : 0), 0);
                            return v > 0 ? v : null;
                          }
                          // Old format (bs array)
                          const v = p.bs.filter(r => r.type === "line" && (r.value ?? 0) > 0).reduce((s, r) => s + (r.value ?? 0), 0);
                          return v > 0 ? v : null;
                        })()
                      : (p.rows ?? []).find(r => r.value != null)?.value;
                  const highlightLabel =
                    key === "balance-sheet" ? "Total Assets"
                    : key === "trial-balance" ? "Total Debits"
                    : "Total";
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
                          {isActive && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background: color + "20", color }}>
                              VIEWING
                            </span>
                          )}
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
                              {highlightLabel}
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
                            {p.uploadFolder && (
                              <p className="text-[9px] text-gray-400 font-mono mt-0.5" title={`Folder: ${p.uploadFolder}`}>
                                {p.uploadFolder.replace("_", " ")}
                              </p>
                            )}
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

              {/* Trial Balance */}
              {key === "trial-balance" && (
                selected.rows?.length
                  ? <ReportTable rows={selected.rows} title={`Trial Balance — ${selected.period}`} columns={selected.columns} />
                  : <ReportTable rows={selected.bs}  title={`Trial Balance — ${selected.period}`} />
              )}

              {/* Generic report */}
              {key !== "balance-sheet" && key !== "trial-balance" && (
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

              {/* Trial Balance */}
              {key === "trial-balance" && (
                selected.rows?.length
                  ? <ReportTable rows={selected.rows} title={`Trial Balance — ${selected.period}`} columns={selected.columns} />
                  : <ReportTable rows={selected.bs}  title={`Trial Balance — ${selected.period}`} />
              )}

              {/* Generic report */}
              {key !== "balance-sheet" && key !== "trial-balance" && (
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
        <Link href="/dashboard">
          <Image src="/logo.png" alt="Diamond Star Arabia" width={110} height={65}
            className="object-contain brightness-0 invert cursor-pointer" />
        </Link>
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
