"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight, LogOut, Landmark, Upload, FileSpreadsheet,
  Trash2, ArrowLeft, CalendarDays, Info, TrendingUp,
  ArrowDownUp, Receipt, FileBarChart,
} from "lucide-react";
import * as XLSX from "xlsx";
import CompanySelector from "@/components/company-selector";
import type { PeriodFile, BsRow, CfRow, ReportType, ReportRow } from "@/app/api/account/route";

const BRAND  = "#1B3A6B";
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ─── Report type definitions ─────────────────────────────────────────────────
const REPORT_TYPES = [
  { key: "balance-sheet"      as ReportType, label: "Balance Sheet",        Icon: Landmark,    color: BRAND,     bg: "#EEF2F9" },
  { key: "profit-loss"        as ReportType, label: "Profit and Loss",      Icon: TrendingUp,  color: "#059669", bg: "#ECFDF5" },
  { key: "cash-flow"          as ReportType, label: "Cash Flow Statement",  Icon: ArrowDownUp, color: "#0891B2", bg: "#ECFEFF" },
  { key: "executive-summary"  as ReportType, label: "Executive Summary",    Icon: FileBarChart,color: "#7C3AED", bg: "#F5F3FF" },
  { key: "tax-report"         as ReportType, label: "Tax Report",           Icon: Receipt,     color: "#D97706", bg: "#FFFBEB" },
] as const;

// ─── Excel date serial → "31-May-2025" ───────────────────────────────────────
function excelDateToStr(serial: number): string {
  try {
    const d = XLSX.SSF.parse_date_code(serial);
    return `${String(d.d).padStart(2,"0")}-${MONTHS[d.m-1]}-${d.y}`;
  } catch { return String(serial); }
}

// ─── Row type classifier ──────────────────────────────────────────────────────
function classify(label: string): "section" | "total" | "line" {
  const u = label.toUpperCase().trim();
  if (
    u === "NON CURRENT ASSETS" || u === "CURRENT ASSETS" || u === "EQUITY" ||
    u === "NON-CURRENT LIABILITY" || u === "CURRENT LIABILITIES" ||
    u === "OPERATING ACTIVITIES" || u === "ADJUSTMENTS FOR:" ||
    u === "CHANGES IN OPERATING ASSETS AND LIABILITIES:" ||
    u === "INVESTING ACTIVITIES" || u === "FINANCING ACTIVITIES" ||
    u === "REVENUE" || u === "COST OF GOODS SOLD" || u === "EXPENSES" ||
    u === "OTHER INCOME" || u === "TAX"
  ) return "section";
  if (
    label.startsWith("Total")  || label.startsWith("TOTAL")  ||
    label.startsWith("Gross")  || label.startsWith("Net Income") ||
    label.startsWith("Net Profit") || label.startsWith("Gross Profit") ||
    label === "Cash from operations" ||
    label === "Net cash from operating activities" ||
    label === "Net cash from investing activities" ||
    label === "Net cash (used in)/from financing activities" ||
    label === "Net change in cash and cash equivalents" ||
    label === "Closing Cash and Bank"
  ) return "total";
  return "line";
}

// ─── Parse balance-sheet Excel (two-period format) ────────────────────────────
function parseBalanceSheet(rows: unknown[][], company: string): PeriodFile[] {
  const row3    = rows[3] as unknown[];
  const serial1 = Number(row3[3]);
  const serial2 = Number(row3[4]);
  const p1 = isNaN(serial1) ? "" : excelDateToStr(serial1);
  const p2 = isNaN(serial2) ? "" : excelDateToStr(serial2);

  const bs1: BsRow[] = [], bs2: BsRow[] = [];
  const cf1: CfRow[] = [], cf2: CfRow[] = [];

  rows.slice(4).forEach((r) => {
    const row = r as (string | number)[];
    const bsLabel = String(row[1] || "").trim();
    const bsV1    = row[3] !== "" ? Number(row[3]) : null;
    const bsV2    = row[4] !== "" ? Number(row[4]) : null;
    if (bsLabel) {
      const type = classify(bsLabel);
      if (p1) bs1.push({ label: bsLabel, value: isNaN(bsV1 as number) ? null : bsV1, type });
      if (p2) bs2.push({ label: bsLabel, value: isNaN(bsV2 as number) ? null : bsV2, type });
    }
    const cfLabel = String(row[7] || "").trim();
    const cfV1    = row[9]  !== "" ? Number(row[9])  : null;
    const cfV2    = row[10] !== "" ? Number(row[10]) : null;
    if (cfLabel) {
      const type = classify(cfLabel);
      if (p1) cf1.push({ label: cfLabel, value: isNaN(cfV1 as number) ? null : cfV1, type });
      if (p2) cf2.push({ label: cfLabel, value: isNaN(cfV2 as number) ? null : cfV2, type });
    }
  });

  const now = new Date().toISOString();
  const result: PeriodFile[] = [];
  if (p1) result.push({ reportType: "balance-sheet", period: p1, company, uploadedAt: now, bs: bs1, cf: cf1 });
  if (p2) result.push({ reportType: "balance-sheet", period: p2, company, uploadedAt: now, bs: bs2, cf: cf2 });
  return result;
}

// ─── Parse any generic Excel file ────────────────────────────────────────────
function parseGenericReport(rows: unknown[][], company: string, reportType: ReportType): PeriodFile[] {
  let period = "";
  outer: for (let i = 0; i < Math.min(5, rows.length); i++) {
    for (const cell of rows[i] as (string | number)[]) {
      if (typeof cell === "number" && cell > 40000 && cell < 55000) {
        try { period = excelDateToStr(cell); break outer; } catch {}
      }
    }
  }
  if (!period) {
    const d = new Date();
    period = `${String(d.getDate()).padStart(2,"0")}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
  }

  const dataRows: ReportRow[] = [];
  rows.forEach(r => {
    const row = r as (string | number | null | undefined)[];
    const labelA = String(row[0] ?? "").trim();
    const labelB = String(row[1] ?? "").trim();
    const label  = labelA || labelB;
    if (!label) return;

    let value: number | null = null;
    const startCol = labelA ? 1 : 2;
    for (let i = startCol; i < Math.min(row.length, 8); i++) {
      const v = row[i];
      if (v !== "" && v !== null && v !== undefined) {
        const n = typeof v === "number" ? v : parseFloat(String(v));
        if (Number.isFinite(n)) { value = n; break; }
      }
    }
    dataRows.push({ label, value, type: classify(label) });
  });

  if (!dataRows.length) return [];
  return [{
    reportType,
    period,
    company,
    uploadedAt: new Date().toISOString(),
    bs: [],
    cf: [],
    rows: dataRows,
  }];
}

// ─── Number formatter ─────────────────────────────────────────────────────────
const fmt = (n: number | null) => {
  if (n === null || n === undefined || n === 0) return "—";
  if (n < 0) return `(${Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})})`;
  return n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
};

// ─── Shared report row table ──────────────────────────────────────────────────
function ReportTable({ rows, title }: { rows: (BsRow | CfRow | ReportRow)[]; title: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-white flex items-center justify-between"
        style={{ background: BRAND }}>
        <span>{title}</span><span>SAR</span>
      </div>
      {rows.map((row, i) => {
        if (row.type === "section") return (
          <div key={i} className="px-5 py-1.5 text-[10px] font-bold uppercase tracking-widest"
            style={{ color: BRAND, background: "#EEF2F9" }}>{row.label}</div>
        );
        if (row.type === "total") {
          const isDouble =
            row.label.toUpperCase().startsWith("TOTAL ASSETS") ||
            row.label.toUpperCase().startsWith("TOTAL EQUITY AND") ||
            row.label === "Closing Cash and Bank";
          return (
            <div key={i} className="flex items-center px-5 py-2.5 text-[12px]"
              style={{ background: isDouble ? "#EEF2F9" : "#f9fafb", borderTop: "1px solid #e5e7eb",
                borderBottom: isDouble ? `2px double ${BRAND}` : "1px solid #e5e7eb" }}>
              <span className="flex-1 font-bold" style={{ color: isDouble ? BRAND : "#374151" }}>{row.label}</span>
              <span className="font-bold font-mono tabular-nums"
                style={{ color: (row.value ?? 0) < 0 ? "#ef4444" : isDouble ? BRAND : "#111827" }}>
                {fmt(row.value)}
              </span>
            </div>
          );
        }
        return (
          <div key={i} className="flex items-center px-5 py-2 border-b border-gray-50 hover:bg-gray-50 transition-colors text-[12px]">
            <span className="flex-1 text-gray-500 pl-3">{row.label}</span>
            <span className="font-mono tabular-nums"
              style={{ color: (row.value ?? 0) < 0 ? "#ef4444" : (row.value ?? 0) === 0 ? "#d1d5db" : "#374151" }}>
              {fmt(row.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Period detail: Balance Sheet ─────────────────────────────────────────────
function BsPeriodView({ period, onBack, onDelete }: {
  period: PeriodFile; onBack: () => void; onDelete: () => void;
}) {
  const [tab, setTab] = useState<"bs"|"cf">("bs");
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <ArrowLeft size={16} /> Back to periods
        </button>
        <button onClick={onDelete}
          className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 border border-red-200 rounded-lg px-3 py-1.5 transition-colors">
          <Trash2 size={12} /> Delete period
        </button>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-4 flex items-center gap-3">
        <CalendarDays size={20} style={{ color: BRAND }} />
        <div>
          <p className="text-lg font-bold" style={{ color: BRAND }}>{period.period}</p>
          <p className="text-xs text-gray-400">
            Uploaded {new Date(period.uploadedAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}
            &nbsp;· {period.company}
          </p>
        </div>
      </div>
      <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-100 shadow-sm w-fit">
        {(["bs","cf"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-6 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{ background: tab===t ? BRAND : "transparent", color: tab===t ? "#fff" : "#6b7280" }}>
            {t === "bs" ? "Balance Sheet" : "Cash Flow"}
          </button>
        ))}
      </div>
      {tab === "bs" && <ReportTable rows={period.bs} title={`Balance Sheet — ${period.period}`} />}
      {tab === "cf" && <ReportTable rows={period.cf} title={`Cash Flow — ${period.period}`} />}
    </div>
  );
}

// ─── Period detail: Generic ───────────────────────────────────────────────────
function GenericPeriodView({ period, title, onBack, onDelete }: {
  period: PeriodFile; title: string; onBack: () => void; onDelete: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <ArrowLeft size={16} /> Back to periods
        </button>
        <button onClick={onDelete}
          className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 border border-red-200 rounded-lg px-3 py-1.5 transition-colors">
          <Trash2 size={12} /> Delete period
        </button>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-4 flex items-center gap-3">
        <CalendarDays size={20} style={{ color: BRAND }} />
        <div>
          <p className="text-lg font-bold" style={{ color: BRAND }}>{period.period}</p>
          <p className="text-xs text-gray-400">
            Uploaded {new Date(period.uploadedAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}
            &nbsp;· {period.company}
          </p>
        </div>
      </div>
      <ReportTable rows={period.rows ?? []} title={`${title} — ${period.period}`} />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function FinancialReportsPage() {
  const router   = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [company,    setCompany]    = useState("diamond-star");
  const [activeType, setActiveType] = useState<ReportType>("balance-sheet");
  const [periods,    setPeriods]    = useState<PeriodFile[]>([]);
  const [selected,   setSelected]   = useState<PeriodFile | null>(null);
  const [uploading,  setUploading]  = useState(false);
  const [drag,       setDrag]       = useState(false);
  const [uploadMsg,  setUploadMsg]  = useState("");

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

  const fetchPeriods = useCallback(async (co: string, type: ReportType) => {
    try {
      const res  = await fetch(`/api/account?company=${co}&type=${type}`);
      const data = await res.json();
      setPeriods(data.periods ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    setSelected(null);
    fetchPeriods(company, activeType);
  }, [company, activeType, fetchPeriods]);

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
          activeType === "balance-sheet"
            ? parseBalanceSheet(rows, company)
            : parseGenericReport(rows, company, activeType);

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

        setUploadMsg(`✓ ${saved} period${saved>1?"s":""} saved (${parsed.map(p=>p.period).join(", ")})`);
        await fetchPeriods(company, activeType);
      } catch { setUploadMsg("Could not read file."); }
      setUploading(false);
    };
    reader.readAsArrayBuffer(file);
  }, [company, activeType, fetchPeriods]);

  const handleDelete = async (period: PeriodFile) => {
    await fetch(
      `/api/account?company=${period.company}&period=${encodeURIComponent(period.period)}&type=${activeType}`,
      { method: "DELETE" }
    );
    setSelected(null);
    fetchPeriods(company, activeType);
  };

  const meta = REPORT_TYPES.find(r => r.key === activeType)!;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#F4F6FA" }}>

      {/* Navbar */}
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
        <div className="mx-auto max-w-5xl space-y-6">

          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-xs text-gray-400">
            <Link href="/dashboard" className="hover:text-[#1B3A6B]">Dashboard</Link>
            <ChevronRight size={12} />
            <Link href="/dashboard/finance" className="hover:text-[#1B3A6B]">Finance</Link>
            <ChevronRight size={12} />
            <span className="text-gray-600 font-medium">Financial Reports</span>
          </nav>

          {/* Page header */}
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl text-white shrink-0"
              style={{ background: `linear-gradient(135deg,${BRAND},#2a5a9e)` }}>
              <FileBarChart size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">Financial Reports</h1>
              <p className="text-sm text-gray-400">Upload, store and view statement reports by type</p>
            </div>
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 md:grid-cols-[220px,1fr] gap-5 items-start">

            {/* ── Sidebar ── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  Statement Reports
                </span>
              </div>
              {REPORT_TYPES.map(({ key, label, Icon, color, bg }) => {
                const active = activeType === key;
                return (
                  <button key={key}
                    onClick={() => { setActiveType(key); setUploadMsg(""); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm transition-all border-b border-gray-50 last:border-b-0 text-left"
                    style={{ background: active ? bg : "transparent", color: active ? color : "#4b5563", fontWeight: active ? 600 : 400 }}>
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg flex-shrink-0 transition-all"
                      style={{ background: active ? color + "22" : "#f3f4f6" }}>
                      <Icon size={14} style={{ color: active ? color : "#9ca3af" }} />
                    </div>
                    {label}
                  </button>
                );
              })}
            </div>

            {/* ── Content ── */}
            <div className="space-y-4 min-w-0">
              {selected ? (
                activeType === "balance-sheet" ? (
                  <BsPeriodView period={selected} onBack={() => setSelected(null)} onDelete={() => handleDelete(selected)} />
                ) : (
                  <GenericPeriodView period={selected} title={meta.label} onBack={() => setSelected(null)} onDelete={() => handleDelete(selected)} />
                )
              ) : (
                <>
                  {/* Type heading */}
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl text-white shrink-0"
                      style={{ background: `linear-gradient(135deg,${meta.color},${meta.color}bb)` }}>
                      <meta.Icon size={18} />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-gray-800">{meta.label}</h2>
                      <p className="text-xs text-gray-400">{periods.length} period{periods.length !== 1 ? "s" : ""} saved</p>
                    </div>
                  </div>

                  {/* Upload zone */}
                  <div
                    onClick={() => inputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                    onDragLeave={() => setDrag(false)}
                    onDrop={(e) => { e.preventDefault(); setDrag(false); const f=e.dataTransfer.files[0]; if(f) processFile(f); }}
                    className="flex flex-col items-center gap-3 py-10 rounded-2xl border-2 border-dashed cursor-pointer transition-all"
                    style={{ borderColor: drag ? meta.color : "#c7d2fe", background: drag ? meta.bg : "#f8faff" }}
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl"
                      style={{ background: drag ? meta.color : "#e0e7ff" }}>
                      <Upload size={26} style={{ color: drag ? "#fff" : BRAND }} />
                    </div>
                    <div className="text-center">
                      <p className="text-base font-bold" style={{ color: BRAND }}>
                        {uploading ? "Uploading…" : `Upload ${meta.label}`}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Drop an Excel file here or click to browse
                        {activeType === "balance-sheet" && " · Both periods will be saved automatically"}
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

                  {/* Info */}
                  <div className="flex gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                    <Info size={16} className="shrink-0 mt-0.5 text-blue-400" />
                    <p>
                      {activeType === "balance-sheet"
                        ? <>Upload <strong>data.xlsx</strong> — the system reads two period columns and stores them separately. Click any saved period to view the full Balance Sheet and Cash Flow.</>
                        : <>Upload your <strong>{meta.label}</strong> Excel file. Each row is read automatically. Click any saved period to view the full report.</>
                      }
                    </p>
                  </div>

                  {/* Saved periods */}
                  {periods.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
                      <FileSpreadsheet size={40} className="text-gray-200 mb-3" />
                      <p className="text-gray-400 font-medium">No periods saved yet</p>
                      <p className="text-xs text-gray-300 mt-1">Upload an Excel file above to get started</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {periods.map((p) => {
                        const highlight =
                          activeType === "balance-sheet"
                            ? p.bs.find(r => r.label.toUpperCase().startsWith("TOTAL ASSETS"))?.value
                            : (p.rows ?? []).find(r => r.type === "total")?.value;
                        const rowCount =
                          activeType === "balance-sheet"
                            ? p.bs.length + p.cf.length
                            : (p.rows?.length ?? 0);
                        return (
                          <button key={p.period} onClick={() => setSelected(p)}
                            className="group text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:border-[#1B3A6B]/30 hover:shadow-md transition-all">
                            <div className="flex items-center gap-2 mb-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-xl text-white shrink-0"
                                style={{ background: `linear-gradient(135deg,${meta.color},${meta.color}bb)` }}>
                                <CalendarDays size={16} />
                              </div>
                              <div>
                                <p className="text-sm font-bold" style={{ color: BRAND }}>{p.period}</p>
                                <p className="text-[10px] text-gray-400">
                                  {new Date(p.uploadedAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}
                                </p>
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-400">
                                  {activeType === "balance-sheet" ? "Total Assets" : "Total / Net"}
                                </span>
                                <span className="font-semibold font-mono" style={{ color: BRAND }}>
                                  {highlight != null
                                    ? highlight.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0})
                                    : "—"}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-400">Rows</span>
                                <span className="font-semibold text-gray-600">{rowCount}</span>
                              </div>
                            </div>
                            <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between">
                              <span className="text-[10px] text-gray-300">Click to view report</span>
                              <ChevronRight size={14} className="text-gray-300 group-hover:text-[#1B3A6B] transition-colors" />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
