"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart as RPieChart, Pie,
} from "recharts";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LogOut, ChevronRight, LayoutDashboard,
  TrendingUp,
  ArrowUpRight, ArrowDownRight, Download,
  BarChart3, PieChart, Banknote, Receipt, FileText,
} from "lucide-react";
import CompanySelector, { COMPANIES } from "@/components/company-selector";
import * as XLSX from "xlsx-js-style";
import type { PeriodFile } from "@/app/api/account/route";
import JarvisAssistant from "@/components/jarvis-assistant";

const BRAND = "#1B3A6B";
const ALL_MONTHS_CONST = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"] as const;

/* ── helpers ───────────────────────────────────────────────────────────── */
const fmtN = (n: number) => Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtM = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1e9) return s + (a / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return s + (a / 1e6).toFixed(2) + "M";
  return s + a.toLocaleString("en-US", { maximumFractionDigits: 0 });
};
const fmtNeg = (n: number) =>
  n < 0 ? `(${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })})`
        : n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const coName = (id: string) => COMPANIES.find(c => c.id === id)?.name ?? id;
const isAr = (s: string) => /[؀-ۿ]/.test(s);

/* ── row-finder helpers ─────────────────────────────────────────────────── */
// all-words: every word in key appears somewhere in label (handles typos like "Grosss Profit")
function allWordsMatch(label: string, key: string): boolean {
  const lbl = label.toLowerCase();
  return key.toLowerCase().split(/\s+/).filter(Boolean).every(w => lbl.includes(w));
}

function bsFind(arr: PeriodFile["bs"], ...keys: string[]): number {
  for (const k of keys) {
    let r = arr.find(r => r.label.toLowerCase().trim().includes(k.toLowerCase()));
    if (r && r.value !== null) return r.value;
    r = arr.find(r => allWordsMatch(r.label.trim(), k));
    if (r && r.value !== null) return r.value;
  }
  return 0;
}

function rowFind(arr: NonNullable<PeriodFile["rows"]>, ...keys: string[]): number {
  for (const k of keys) {
    // prefer total-type rows
    let r = arr.find(r => r.type === "total" && r.label.toLowerCase().trim().includes(k.toLowerCase()) && r.value !== null);
    if (r) return r.value!;
    r = arr.find(r => r.label.toLowerCase().trim().includes(k.toLowerCase()) && r.value !== null);
    if (r) return r.value!;
    // all-words fallback (handles typos, reordering)
    r = arr.find(r => r.type === "total" && allWordsMatch(r.label.trim(), k) && r.value !== null);
    if (r) return r.value!;
    r = arr.find(r => allWordsMatch(r.label.trim(), k) && r.value !== null);
    if (r) return r.value!;
  }
  return 0;
}

// When the P&L has no explicit "Total Revenue" row, sum all line items in the Revenue section
function computeRevenue(rows: NonNullable<PeriodFile["rows"]>): number {
  const explicit = rowFind(rows, "total revenue", "net revenue", "total sales", "revenue total", "total income");
  if (explicit) return explicit;
  let inRev = false, total = 0;
  for (const row of rows) {
    const lbl = row.label.toLowerCase().trim();
    if ((lbl === "revenue" || lbl === "income" || lbl === "sales") && row.type === "section") { inRev = true; continue; }
    if (inRev) {
      if (row.type === "section") break;
      if (row.type === "line" && row.value !== null) total += row.value;
    }
  }
  return total;
}

/* ── custom tooltip ──────────────────────────────────────────────────────── */
function ChartTooltip({ active, payload, label, fmt = fmtM }: {
  active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string;
  fmt?: (n: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl shadow-lg border border-gray-100 bg-white px-3 py-2 text-[11px]">
      {label && <p className="font-bold text-gray-700 mb-1">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
          <span className="text-gray-500">{p.name}:</span>
          <span className="font-bold font-mono" style={{ color: p.color }}>SAR {fmt(Math.abs(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */
export default function AccountDashboardPage() {
  const router = useRouter();

  /* financial-reports states */
  const [bsPeriods, setBsPeriods]   = useState<PeriodFile[]>([]);
  const [plPeriods, setPlPeriods]   = useState<PeriodFile[]>([]);
  const [cfPeriods, setCfPeriods]   = useState<PeriodFile[]>([]);
  const [taxPeriods, setTaxPeriods] = useState<PeriodFile[]>([]);
  const [tbPeriods,  setTbPeriods]  = useState<PeriodFile[]>([]);
  const [activeIdx, setActiveIdx]   = useState(0);
  const [frCompany, setFrCompany]   = useState("diamond-star");
  const [mounted, setMounted]       = useState(false);
  const [ytdMode, setYtdMode]       = useState(false);
  const [ytdEndIdx, setYtdEndIdx]   = useState(-1);  // -1 = last available month

  useEffect(() => setMounted(true), []);

  /* read active company from localStorage */
  useEffect(() => {
    function readCompany() {
      try {
        const raw = localStorage.getItem("selected_companies");
        const ids: string[] = raw ? JSON.parse(raw) : ["diamond-star"];
        setFrCompany(ids[0] ?? "diamond-star");
      } catch {}
    }
    readCompany();
    const handler = (e: Event) => {
      const ids = (e as CustomEvent<string[]>).detail;
      if (ids?.length) setFrCompany(ids[0]);
    };
    window.addEventListener("companiesChanged", handler);
    return () => window.removeEventListener("companiesChanged", handler);
  }, []);

  /* reset YTD state when company changes */
  useEffect(() => {
    setYtdMode(false);
    setYtdEndIdx(-1);
    setActiveIdx(0);
  }, [frCompany]);

  /* fetch all 6 report types */
  useEffect(() => {
    if (!frCompany) return;
    Promise.all([
      fetch(`/api/account?company=${frCompany}&type=balance-sheet`).then(r => r.json()),
      fetch(`/api/account?company=${frCompany}&type=profit-loss`).then(r => r.json()),
      fetch(`/api/account?company=${frCompany}&type=cash-flow`).then(r => r.json()),
      fetch(`/api/account?company=${frCompany}&type=tax-report`).then(r => r.json()),
      fetch(`/api/account?company=${frCompany}&type=trial-balance`).then(r => r.json()),
    ]).then(([bs, pl, cf, tax, tb]) => {
      setBsPeriods(bs.periods ?? []);
      setPlPeriods(pl.periods ?? []);
      setCfPeriods(cf.periods ?? []);
      setTaxPeriods(tax.periods ?? []);
      setTbPeriods(tb.periods ?? []);
      setActiveIdx(0);
    }).catch(() => {});
  }, [frCompany]);

  /* current period slices */
  const bsP  = bsPeriods[activeIdx]  ?? bsPeriods[0];
  const plP  = plPeriods[activeIdx]  ?? plPeriods[0];
  const cfP  = cfPeriods[activeIdx]  ?? cfPeriods[0];
  const taxP = taxPeriods[activeIdx] ?? taxPeriods[0];
  const tbP  = tbPeriods[activeIdx]  ?? tbPeriods[0];

  const bsRows  = bsP?.bs   ?? [];
  const plRows  = plP?.rows ?? [];
  const cfRows  = cfP?.rows ?? [];
  const taxRows = taxP?.rows ?? [];
  // TB: new format stores in rows[] with values=[opening,debits,credits,netChange,closing]
  // Old format stores in bs[] with value=closing. Support both.
  const tbIsNew   = (tbP?.rows?.length ?? 0) > 0;
  const tbRows    = tbIsNew ? (tbP?.rows ?? []) : (tbP?.bs ?? []);

  /* ── YTD computation ──────────────────────────────────────────────────── */
  // Monthly columns from P&L (index 0 = "Total", 1+ = individual months)
  const plCols = (plP?.columns ?? []).slice(1); // ["Jan","Feb","Mar","Apr","May"]
  const cfCols = (cfP?.columns ?? []).slice(1);

  // When ytdMode and ytdEndIdx = -1, default to the last available month
  const effectiveYtdEnd = ytdMode
    ? (ytdEndIdx >= 0 && ytdEndIdx < plCols.length ? ytdEndIdx : plCols.length - 1)
    : plCols.length - 1;

  // Month pills: which of the 12 calendar months appear in P&L data
  const monthAvailability = useMemo(() =>
    ALL_MONTHS_CONST.map(m => plCols.findIndex(c => c.toLowerCase().startsWith(m.toLowerCase()))),
  [plCols]);

  // Apply YTD: replace each row's `value` with sum of columns 1..effectiveYtdEnd+1
  const ytdPlRows = useMemo(() => {
    if (!ytdMode || plRows.length === 0 || plCols.length <= 1) return plRows;
    return plRows.map(row => {
      if (!row.values || row.values.length <= 1) return row;
      let sum = 0;
      for (let i = 1; i <= effectiveYtdEnd + 1 && i < row.values.length; i++) {
        sum += (row.values[i] ?? 0);
      }
      return { ...row, value: sum };
    });
  }, [ytdMode, plRows, plCols.length, effectiveYtdEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  const ytdCfRows = useMemo(() => {
    if (!ytdMode || cfRows.length === 0 || cfCols.length <= 1) return cfRows;
    return cfRows.map(row => {
      if (!row.values || row.values.length <= 1) return row;
      let sum = 0;
      for (let i = 1; i <= effectiveYtdEnd + 1 && i < row.values.length; i++) {
        sum += (row.values[i] ?? 0);
      }
      return { ...row, value: sum };
    });
  }, [ytdMode, cfRows, cfCols.length, effectiveYtdEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  // Label for the YTD range shown in section header and KPI sub-text
  const ytdRangeLabel = ytdMode && plCols.length > 0
    ? `YTD: ${plCols[0]} – ${plCols[effectiveYtdEnd]}`
    : null;
  const ytdMonthCount = ytdMode ? effectiveYtdEnd + 1 : null;

  /* Trial Balance derived values */
  const tbAccountCount = tbRows.filter(r => r.type === "line").length;
  const tbTotalDebit   = tbIsNew
    ? tbRows.filter(r => r.type === "line").reduce((s, r) => {
        const v = (r as {values?:(number|null)[]}).values?.[1] ?? 0;
        return s + (v > 0 ? v : 0);
      }, 0)
    : tbRows.filter(r => r.type === "line" && (r.value ?? 0) > 0).reduce((s, r) => s + (r.value ?? 0), 0);
  const tbTotalCredit  = tbIsNew
    ? tbRows.filter(r => r.type === "line").reduce((s, r) => {
        const v = (r as {values?:(number|null)[]}).values?.[2] ?? 0;
        return s + (v > 0 ? v : 0);
      }, 0)
    : Math.abs(tbRows.filter(r => r.type === "line" && (r.value ?? 0) < 0).reduce((s, r) => s + (r.value ?? 0), 0));
  const tbBalanced     = Math.abs(tbTotalDebit - tbTotalCredit) < 1;
  const tbPeriod       = tbP?.period ?? "";

  /* ── derived KPIs (use ytdPlRows / ytdCfRows so YTD mode recalculates) ── */
  // P&L — many Excel files use different label formats; fallbacks cover real-world variations
  const revenue      = computeRevenue(ytdPlRows);
  const grossProfit  = rowFind(ytdPlRows, "gross profit", "grosss profit", "gross margin", "gross income");
  const netProfit    = rowFind(ytdPlRows, "net profit after tax", "net profit", "net income", "profit after tax", "profit for the period", "net earnings");
  const ebit         = rowFind(ytdPlRows, "operating profit", "ebit", "profit from operations", "income from operations", "operating income");

  // Balance Sheet
  const totalAssets  = bsFind(bsRows, "total assets");
  const totalEquity  = bsFind(bsRows, "total equity", "shareholders equity", "total shareholders equity", "stockholders equity", "owners equity");
  const totalLiab    = bsFind(bsRows, "total liabilities", "total liability");
  const cashBs       = bsFind(bsRows, "cash & cash equivalents", "cash and cash equivalents", "cash & equivalents", "cash");
  const currAssets   = bsFind(bsRows, "total current assets", "current assets");
  const nonCurrAssets= bsFind(bsRows, "total non-current assets", "non-current assets", "non current assets", "fixed assets", "total fixed assets");
  const currLiab     = bsFind(bsRows, "total current liabilities", "current liabilities");
  const nonCurrLiab  = bsFind(bsRows, "total non-current liabilities", "non-current liabilities", "non current liabilities", "long term liabilities");
  const retainedEarnings = bsFind(bsRows, "retained earnings", "retained profit", "accumulated profit");
  const paidCapital  = bsFind(bsRows, "paid-up capital", "paid up capital", "share capital", "ordinary shares", "issued capital");

  // Cash Flow (ytdCfRows: summed if CF has monthly columns, otherwise same as cfRows)
  const operatingCF  = rowFind(ytdCfRows, "net cash from operating", "cash from operations", "operating activities", "net cash provided by operating", "net cash used in operating");
  const investingCF  = rowFind(ytdCfRows, "net cash from investing", "cash from investing", "investing activities", "net cash used in investing");
  const financingCF  = rowFind(ytdCfRows, "net cash from financing", "cash from financing", "financing activities", "net cash used in financing");
  const closingCash  = rowFind(cfRows, "cash & equivalents — end", "cash at end", "closing cash", "closing balance", "cash end of period", "cash at the end", "cash and cash equivalents at end");

  const gpMargin     = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  const netMargin    = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  const currentRatio = currLiab !== 0 ? Math.abs(currAssets) / Math.abs(currLiab) : 0;
  const debtToEquity = totalEquity !== 0 ? Math.abs(totalLiab) / Math.abs(totalEquity) : 0;

  // Tax
  const taxZakat     = rowFind(taxRows, "zakat payable", "zakat");
  const taxVatNet    = rowFind(taxRows, "net vat payable", "vat payable", "net vat");
  const taxWht       = rowFind(taxRows, "total wht withheld", "wht withheld", "withholding tax");
  const taxTotal     = rowFind(taxRows, "total tax payments", "total tax", "tax payable", "income tax");

  // P&L section breakdown (use ytdPlRows so YTD mode re-slices sections)
  const plSections: { label: string; value: number }[] = [];
  {
    let i = 0;
    while (i < ytdPlRows.length) {
      const row = ytdPlRows[i];
      if (row.type === "section" && (row.indent ?? 0) === 0) {
        const sectionLabel = row.label.replace(/^\S+\s+/, "").trim(); // strip code prefix
        const totalRow = ytdPlRows.slice(i + 1).find(r =>
          r.type === "total" &&
          (r.indent ?? 0) === 0 &&
          r.value !== null
        );
        if (totalRow && Math.abs(totalRow.value ?? 0) > 0)
          plSections.push({ label: sectionLabel, value: totalRow.value! });
      }
      i++;
    }
  }

  // Cash Flow sections (use ytdCfRows)
  const cfSections: { label: string; value: number }[] = [];
  {
    let i = 0;
    while (i < ytdCfRows.length) {
      const row = ytdCfRows[i];
      if (row.type === "section" && (row.indent ?? 0) === 0) {
        const sectionLabel = row.label.trim();
        const totalRow = ytdCfRows.slice(i + 1).find(r => r.type === "total" && (r.indent ?? 0) === 0 && r.value !== null);
        if (totalRow && Math.abs(totalRow.value ?? 0) > 0)
          cfSections.push({ label: sectionLabel, value: totalRow.value! });
      }
      i++;
    }
  }

  /* ── P&L monthly chart data ─────────────────────────────────────────── */
  // plCols already defined above; find per-month values from original plRows (bars = individual months)
  const revDataRow = plRows.find(r => r.value === revenue && r.values && revenue > 0)
    ?? plRows.find(r => allWordsMatch(r.label, "total revenue") || allWordsMatch(r.label, "net revenue") || r.label.toLowerCase() === "total revenue");
  const allRevRowVals = revDataRow
    ? (revDataRow.values ?? []).slice(1).map(v => v ?? 0)
    : plCols.map((_, ci) => {
        let inRev = false, tot = 0;
        for (const row of plRows) {
          const lbl = row.label.toLowerCase().trim();
          if ((lbl === "revenue" || lbl === "income" || lbl === "sales") && row.type === "section") { inRev = true; continue; }
          if (inRev) {
            if (row.type === "section") break;
            if (row.type === "line" && row.values) tot += row.values[ci + 1] ?? 0;
          }
        }
        return tot;
      });
  const allGpRowVals = (plRows.find(r => allWordsMatch(r.label.trim(), "gross profit") && r.values)?.values ?? []).slice(1).map(v => v ?? 0);

  // Slice chart to selected YTD range (ytdMode trims, otherwise show all months)
  const chartCols   = ytdMode ? plCols.slice(0, effectiveYtdEnd + 1) : plCols;
  const revRowVals  = allRevRowVals.slice(0, chartCols.length);
  const gpRowVals   = allGpRowVals.slice(0, chartCols.length);

  /* ── recharts data arrays ────────────────────────────────────────────── */
  const monthlyChartData = chartCols.map((month, i) => ({
    month,
    Revenue: revRowVals[i] ?? 0,
    "Gross Profit": gpRowVals[i] ?? 0,
  }));
  const assetDonutData = [
    { name: "Current Assets",     value: Math.abs(currAssets),    color: BRAND    },
    { name: "Non-Current Assets", value: Math.abs(nonCurrAssets), color: "#93c5fd" },
  ];
  const fundingDonutData = [
    { name: "Equity",      value: Math.abs(totalEquity), color: "#059669" },
    { name: "Liabilities", value: Math.abs(totalLiab),   color: "#f87171" },
  ];
  const cfChartData = [
    { name: "Operating", value: Math.abs(operatingCF), actual: operatingCF, color: operatingCF >= 0 ? "#059669" : "#f87171" },
    { name: "Investing",  value: Math.abs(investingCF), actual: investingCF, color: investingCF >= 0 ? "#059669" : "#f87171" },
    { name: "Financing",  value: Math.abs(financingCF), actual: financingCF, color: financingCF >= 0 ? "#0891B2" : "#fb923c" },
  ];

  /* ── Period comparison for 2 periods ─────────────────────────────────── */
  const prevBsP  = bsPeriods.length > 1 ? bsPeriods[1 - activeIdx] ?? null : null;
  const prevPlP  = plPeriods.length > 1 ? plPeriods[1 - activeIdx] ?? null : null;
  const prevRev  = prevPlP ? computeRevenue(prevPlP.rows ?? []) : 0;
  const prevNet  = prevPlP ? rowFind(prevPlP.rows ?? [], "net profit after tax", "net profit", "net income", "profit after tax", "profit for the period") : 0;
  const prevAssets = prevBsP ? bsFind(prevBsP.bs ?? [], "total assets") : 0;
  const revChange  = prevRev > 0 ? ((revenue - prevRev) / prevRev) * 100 : 0;
  const netChange  = prevNet !== 0 ? ((netProfit - prevNet) / Math.abs(prevNet)) * 100 : 0;
  const assetsChange = prevAssets > 0 ? ((totalAssets - prevAssets) / prevAssets) * 100 : 0;


  /* ── Export ─────────────────────────────────────────────────────────── */
  function exportFullReport() {
    const wb = XLSX.utils.book_new();
    const dateStr = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
    const company = coName(frCompany);

    // ── shared border/style helpers ─────────────────────────────────────────
    type XS = Record<string, unknown>;
    const bdr = (c = "E2E8F0") => ({ top: { style: "thin", color: { rgb: c } }, bottom: { style: "thin", color: { rgb: c } }, left: { style: "thin", color: { rgb: c } }, right: { style: "thin", color: { rgb: c } } });
    const topBrd = (c: string) => ({ top: { style: "medium", color: { rgb: c } }, bottom: { style: "thin", color: { rgb: "93C5FD" } }, left: { style: "thin", color: { rgb: "93C5FD" } }, right: { style: "thin", color: { rgb: "93C5FD" } } });

    const S: Record<string, XS> = {
      title:     { fill: { patternType: "solid", fgColor: { rgb: "1B3A6B" } }, font: { bold: true, color: { rgb: "FFFFFF" }, sz: 14, name: "Calibri" }, alignment: { vertical: "center", wrapText: false } },
      meta:      { fill: { patternType: "solid", fgColor: { rgb: "1B3A6B" } }, font: { color: { rgb: "93B8D9" }, sz: 10, name: "Calibri" } },
      colH:      { fill: { patternType: "solid", fgColor: { rgb: "1B3A6B" } }, font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10, name: "Calibri" }, alignment: { horizontal: "center", vertical: "center" }, border: bdr("2A5A9E") },
      colHR:     { fill: { patternType: "solid", fgColor: { rgb: "1B3A6B" } }, font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10, name: "Calibri" }, alignment: { horizontal: "right",  vertical: "center" }, border: bdr("2A5A9E") },
      sect:      { fill: { patternType: "solid", fgColor: { rgb: "EEF2FF" } }, font: { bold: true, color: { rgb: "1B3A6B" }, sz: 10, name: "Calibri" }, border: bdr("C7D2FE") },
      line:      { fill: { patternType: "solid", fgColor: { rgb: "FFFFFF" } }, font: { sz: 10, name: "Calibri", color: { rgb: "374151" } }, border: bdr("F1F5F9") },
      lineAlt:   { fill: { patternType: "solid", fgColor: { rgb: "F8FAFC" } }, font: { sz: 10, name: "Calibri", color: { rgb: "374151" } }, border: bdr("F1F5F9") },
      tot:       { fill: { patternType: "solid", fgColor: { rgb: "DBEAFE" } }, font: { bold: true, color: { rgb: "1E3A5F" }, sz: 10, name: "Calibri" }, border: topBrd("1B3A6B") },
      totR:      { fill: { patternType: "solid", fgColor: { rgb: "DBEAFE" } }, font: { bold: true, color: { rgb: "1B3A6B" }, sz: 10, name: "Calibri" }, alignment: { horizontal: "right" }, border: topBrd("1B3A6B") },
      totGreen:  { fill: { patternType: "solid", fgColor: { rgb: "DCFCE7" } }, font: { bold: true, color: { rgb: "166534" }, sz: 10, name: "Calibri" }, alignment: { horizontal: "right" }, border: topBrd("059669") },
      totGreenL: { fill: { patternType: "solid", fgColor: { rgb: "DCFCE7" } }, font: { bold: true, color: { rgb: "166534" }, sz: 10, name: "Calibri" }, border: topBrd("059669") },
      totNeg:    { fill: { patternType: "solid", fgColor: { rgb: "FEE2E2" } }, font: { bold: true, color: { rgb: "991B1B" }, sz: 10, name: "Calibri" }, alignment: { horizontal: "right" }, border: topBrd("DC2626") },
      totNegL:   { fill: { patternType: "solid", fgColor: { rgb: "FEE2E2" } }, font: { bold: true, color: { rgb: "991B1B" }, sz: 10, name: "Calibri" }, border: topBrd("DC2626") },
      numP:      { fill: { patternType: "solid", fgColor: { rgb: "FFFFFF" } }, font: { sz: 10, name: "Calibri", color: { rgb: "059669" } }, alignment: { horizontal: "right" }, border: bdr("F1F5F9") },
      numN:      { fill: { patternType: "solid", fgColor: { rgb: "FFFFFF" } }, font: { sz: 10, name: "Calibri", color: { rgb: "DC2626" } }, alignment: { horizontal: "right" }, border: bdr("F1F5F9") },
      num0:      { fill: { patternType: "solid", fgColor: { rgb: "FFFFFF" } }, font: { sz: 10, name: "Calibri", color: { rgb: "1B3A6B" } }, alignment: { horizontal: "right" }, border: bdr("F1F5F9") },
      num0Alt:   { fill: { patternType: "solid", fgColor: { rgb: "F8FAFC" } }, font: { sz: 10, name: "Calibri", color: { rgb: "1B3A6B" } }, alignment: { horizontal: "right" }, border: bdr("F1F5F9") },
    };

    // cell builders
    const sc = (v: string, s: XS) => ({ v, t: "s" as const, s });
    const nc = (v: number, s: XS) => ({ v, t: "n" as const, s, z: "#,##0" });
    const autoN = (v: number, alt = false): ReturnType<typeof nc> => nc(v, v < 0 ? S.numN : alt ? S.num0Alt : S.num0);
    const empty = (s: XS = S.line) => ({ v: "", t: "s" as const, s });

    // ── Sheet 1: Dashboard Summary ─────────────────────────────────────────
    const buildSummary = () => {
      type Row = (ReturnType<typeof sc> | ReturnType<typeof nc> | ReturnType<typeof empty> | null)[];
      const rows: Row[] = [];
      rows.push([sc(`${company}  —  Financial Dashboard`, S.title), null, null, null, null]);
      rows.push([sc(`Period: ${bsP?.period ?? "—"}   ·   Exported: ${dateStr}`, S.meta), null, null, null, null]);
      rows.push([null, null, null, null, null]);
      rows.push([sc("KEY FINANCIAL INDICATORS", S.sect), null, sc("Current Period", S.colHR), sc("Prior Period", S.colHR), sc("Change", S.colH)]);
      const kpis: [string, number, number][] = [
        ["Total Revenue (SAR)",         revenue,      prevRev],
        ["Gross Profit (SAR)",          grossProfit,  prevPlP ? rowFind(prevPlP.rows ?? [], "gross profit") : 0],
        ["Gross Margin %",              gpMargin,     0],
        ["Net Profit After Tax (SAR)",  netProfit,    prevNet],
        ["Net Margin %",                netMargin,    0],
        ["Total Assets (SAR)",          totalAssets,  prevAssets],
        ["Total Equity (SAR)",          totalEquity,  0],
        ["Total Liabilities (SAR)",     totalLiab,    0],
        ["Cash & Equivalents (SAR)",    cashBs,       0],
        ["Operating Cash Flow (SAR)",   operatingCF,  0],
      ];
      kpis.forEach(([label, cur, prev]) => {
        const isMargin = label.includes("%");
        const chg = prev > 0 ? ((cur - prev) / Math.abs(prev) * 100) : 0;
        const isTot = ["Total Revenue","Gross Profit","Net Profit"].some(k => label.includes(k));
        const numS = cur < 0 ? S.totNeg : isTot ? S.totGreen : S.tot;
        const labS = cur < 0 ? S.totNegL : isTot ? S.totGreenL : S.tot;
        rows.push([
          sc(label, labS),
          null,
          isMargin ? sc(`${Math.abs(cur).toFixed(1)}%`, { ...numS, alignment: { horizontal: "right" } }) : nc(Math.abs(cur), numS),
          prev > 0 ? nc(Math.abs(prev), { ...S.tot, alignment: { horizontal: "right" } }) : sc("—", S.tot),
          prev > 0 ? sc(`${chg >= 0 ? "+" : ""}${chg.toFixed(1)}%`, { ...S.tot, font: { ...S.tot.font as XS, color: { rgb: chg >= 0 ? "059669" : "DC2626" } }, alignment: { horizontal: "center" } }) : sc("—", S.tot),
        ]);
      });
      rows.push([null, null, null, null, null]);
      rows.push([sc("BALANCE SHEET RATIOS", S.sect), null, sc("Value", S.colHR), sc("Status", S.colH), null]);
      [
        ["Current Ratio",  `${currentRatio.toFixed(2)}×`,   currentRatio >= 1],
        ["Debt / Equity",  `${debtToEquity.toFixed(2)}×`,   debtToEquity <= 1.5],
        ["GP Margin",      `${gpMargin.toFixed(1)}%`,        gpMargin >= 30],
        ["Net Margin",     `${netMargin.toFixed(1)}%`,       netMargin >= 10],
      ].forEach(([label, val, good]) => {
        rows.push([sc(label as string, S.line), null,
          sc(val as string, { ...(good ? S.numP : S.numN), font: { ...(good ? S.numP.font : S.numN.font) as XS, bold: true, sz: 11 } }),
          sc(good ? "HEALTHY" : "WATCH", { ...S.line, font: { sz: 9, name: "Calibri", bold: true, color: { rgb: good ? "059669" : "DC2626" } }, alignment: { horizontal: "center" } }),
          null,
        ]);
      });
      if (bsPeriods.length >= 2 && plPeriods.length >= 2) {
        rows.push([null, null, null, null, null]);
        rows.push([sc("PERIOD COMPARISON", S.sect), null, sc(bsPeriods[0].period, S.colHR), sc(bsPeriods[1].period, S.colHR), sc("Change", S.colH)]);
        [
          ["Revenue",     plPeriods.map(p => rowFind(p.rows ?? [], "total revenue"))],
          ["Gross Profit",plPeriods.map(p => rowFind(p.rows ?? [], "gross profit"))],
          ["Net Profit",  plPeriods.map(p => rowFind(p.rows ?? [], "net profit after tax"))],
          ["Total Assets",bsPeriods.map(p => bsFind(p.bs ?? [], "total assets"))],
          ["Total Equity",bsPeriods.map(p => bsFind(p.bs ?? [], "total equity"))],
        ].forEach(([label, vals]) => {
          const v = vals as number[];
          const chg = v[0] > 0 ? ((v[1] - v[0]) / Math.abs(v[0]) * 100) : 0;
          rows.push([sc(label as string, S.line), null, nc(v[0], S.totR), nc(v[1], S.totR),
            sc(`${chg >= 0 ? "+" : ""}${chg.toFixed(1)}%`, { ...S.line, font: { sz: 10, name: "Calibri", bold: true, color: { rgb: chg >= 0 ? "059669" : "DC2626" } }, alignment: { horizontal: "center" } }),
          ]);
        });
      }
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [{ wch: 34 }, { wch: 4 }, { wch: 22 }, { wch: 22 }, { wch: 14 }];
      ws["!rows"] = [{ hpt: 30 }, { hpt: 18 }];
      ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } }];
      return ws;
    };

    // ── Sheet: P&L (with monthly columns) ─────────────────────────────────
    const buildPL = (pf: PeriodFile) => {
      const cols = pf.columns ?? ["Total"];
      type Row = (ReturnType<typeof sc> | ReturnType<typeof nc> | ReturnType<typeof empty> | null)[];
      const rows: Row[] = [];
      rows.push([sc(`${company}  —  Profit & Loss Statement`, S.title), ...Array(cols.length).fill(null)]);
      rows.push([sc(`Period: ${pf.period}   ·   Exported: ${dateStr}`, S.meta), ...Array(cols.length).fill(null)]);
      rows.push(Array(cols.length + 1).fill(null));
      rows.push([sc("Description", S.colH), ...cols.map((c, i) => sc(c, i === 0 ? S.colH : S.colHR))]);
      let alt = false;
      (pf.rows ?? []).forEach(row => {
        if (row.type === "section") {
          rows.push([sc(row.label.trim(), S.sect), ...cols.map(() => empty(S.sect))]);
          alt = false;
        } else if (row.type === "total") {
          const v = row.value ?? 0;
          const lS = v < 0 ? S.totNegL : S.totGreenL;
          const nS = v < 0 ? S.totNeg  : S.totGreen;
          rows.push([sc(row.label.trim(), lS), nc(v, nS), ...(row.values ?? []).slice(1).map(vv => nc(vv ?? 0, vv !== null && vv < 0 ? S.totNeg : S.totR))]);
        } else {
          const v = row.value ?? 0;
          const lineS = alt ? S.lineAlt : S.line;
          const nS = alt ? S.num0Alt : S.num0;
          rows.push([sc(row.label, lineS), autoN(v, alt), ...(row.values ?? []).slice(1).map(vv => nc(vv ?? 0, vv !== null && vv < 0 ? S.numN : nS))]);
          alt = !alt;
        }
      });
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [{ wch: 40 }, ...cols.map(() => ({ wch: 18 }))];
      ws["!rows"] = [{ hpt: 28 }, { hpt: 16 }];
      ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: cols.length } }, { s: { r: 1, c: 0 }, e: { r: 1, c: cols.length } }];
      return ws;
    };

    // ── Sheet: Balance Sheet ───────────────────────────────────────────────
    const buildBS = (pf: PeriodFile) => {
      type Row = (ReturnType<typeof sc> | ReturnType<typeof nc> | ReturnType<typeof empty> | null)[];
      const rows: Row[] = [];
      rows.push([sc(`${company}  —  Balance Sheet`, S.title), null, null]);
      rows.push([sc(`Period: ${pf.period}   ·   Exported: ${dateStr}`, S.meta), null, null]);
      rows.push([null, null, null]);
      rows.push([sc("Description", S.colH), sc("SAR Amount", S.colHR), sc("Notes", S.colH)]);
      let alt = false;
      (pf.bs ?? []).forEach(row => {
        if (row.value === null) {
          rows.push([sc(row.label.trim(), S.sect), empty(S.sect), empty(S.sect)]);
          alt = false;
        } else {
          const v = row.value ?? 0;
          const isTot = row.label.toLowerCase().includes("total");
          const labS = isTot ? (v < 0 ? S.totNegL : v > 0 ? S.totGreenL : S.tot) : (alt ? S.lineAlt : S.line);
          const numS = isTot ? (v < 0 ? S.totNeg : v > 0 ? S.totGreen : S.totR) : (v < 0 ? S.numN : alt ? S.num0Alt : S.num0);
          rows.push([sc(row.label.trim(), labS), nc(v, numS), empty(labS)]);
          if (!isTot) alt = !alt;
        }
      });
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [{ wch: 44 }, { wch: 22 }, { wch: 28 }];
      ws["!rows"] = [{ hpt: 28 }, { hpt: 16 }];
      ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } }];
      return ws;
    };

    // ── Generic sheet (CF, Tax, Executive) ────────────────────────────────
    const buildGeneric = (pf: PeriodFile, title: string) => {
      const cols = pf.columns ?? ["Total"];
      type Row = (ReturnType<typeof sc> | ReturnType<typeof nc> | ReturnType<typeof empty> | null)[];
      const rows: Row[] = [];
      rows.push([sc(`${company}  —  ${title}`, S.title), ...Array(cols.length).fill(null)]);
      rows.push([sc(`Period: ${pf.period}   ·   Exported: ${dateStr}`, S.meta), ...Array(cols.length).fill(null)]);
      rows.push(Array(cols.length + 1).fill(null));
      rows.push([sc("Description", S.colH), ...cols.map((c, i) => sc(c, i === 0 ? S.colH : S.colHR))]);
      let alt = false;
      (pf.rows ?? []).forEach(row => {
        if (row.type === "section") {
          rows.push([sc(row.label.trim(), S.sect), ...cols.map(() => empty(S.sect))]);
          alt = false;
        } else if (row.type === "total") {
          const v = row.value ?? 0;
          const lS = v < 0 ? S.totNegL : S.totGreenL;
          const nS = v < 0 ? S.totNeg  : S.totGreen;
          rows.push([sc(row.label.trim(), lS), nc(v, nS), ...(row.values ?? []).slice(1).map(vv => nc(vv ?? 0, vv !== null && vv < 0 ? S.totNeg : S.totR))]);
        } else {
          const v = row.value ?? 0;
          const lineS = alt ? S.lineAlt : S.line;
          rows.push([sc(row.label, lineS), autoN(v, alt), ...(row.values ?? []).slice(1).map(vv => nc(vv ?? 0, vv !== null && vv < 0 ? S.numN : alt ? S.num0Alt : S.num0))]);
          alt = !alt;
        }
      });
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [{ wch: 44 }, ...cols.map(() => ({ wch: 18 }))];
      ws["!rows"] = [{ hpt: 28 }, { hpt: 16 }];
      ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: cols.length } }, { s: { r: 1, c: 0 }, e: { r: 1, c: cols.length } }];
      return ws;
    };

    // ── Assemble workbook ─────────────────────────────────────────────────
    XLSX.utils.book_append_sheet(wb, buildSummary(), "Dashboard");
    if (plP)  XLSX.utils.book_append_sheet(wb, buildPL(plP),                         "Profit & Loss");
    if (bsP)  XLSX.utils.book_append_sheet(wb, buildBS(bsP),                         "Balance Sheet");
    if (cfP)  XLSX.utils.book_append_sheet(wb, buildGeneric(cfP,  "Cash Flow"),       "Cash Flow");
    if (taxP) XLSX.utils.book_append_sheet(wb, buildGeneric(taxP, "Tax Report"),      "Tax Report");
    XLSX.writeFile(wb, `${company.replace(/\s+/g, "_")}_${(bsP?.period ?? "Report").replace(/-/g, "_")}.xlsx`);
  }

  const hasFinancialData = bsPeriods.length > 0 || plPeriods.length > 0;

  /* ══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#F0F2F7" }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="w-full flex items-center justify-between px-6 py-3 shadow-md gap-4 relative z-20"
        style={{ backgroundColor: BRAND }}>
        <Link href="/dashboard">
          <Image src="/logo.png" alt="Diamond Star Arabia" width={110} height={65}
            className="object-contain brightness-0 invert flex-shrink-0 cursor-pointer" />
        </Link>
        <div className="flex-1 flex justify-center"><CompanySelector /></div>
        <button onClick={() => router.push("/login")}
          className="flex items-center gap-2 text-white/80 hover:text-white text-sm font-medium transition-colors flex-shrink-0">
          <LogOut size={16} /> Log out
        </button>
      </header>

      <main className="flex-1 w-full px-4 md:px-8 py-7">
        <div className="mx-auto max-w-7xl space-y-6">

          {/* ── Breadcrumb ─────────────────────────────────────────────── */}
          <nav className="flex items-center gap-1.5 text-xs text-gray-400">
            <Link href="/dashboard" className="hover:text-[#1B3A6B] transition-colors">Dashboard</Link>
            <ChevronRight size={12} />
            <Link href="/dashboard/finance" className="hover:text-[#1B3A6B] transition-colors">Finance</Link>
            <ChevronRight size={12} />
            <span className="text-gray-600 font-medium">Account Dashboard</span>
          </nav>

          {/* ── Page Title ─────────────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm"
                style={{ background: `linear-gradient(135deg, ${BRAND}, #2a5a9e)` }}>
                <LayoutDashboard size={22} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">Account Dashboard</h1>
                <p className="text-sm text-gray-500">
                  {coName(frCompany)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {hasFinancialData && bsPeriods.length > 1 && (
                <div className="flex gap-1 bg-white rounded-xl border border-gray-100 shadow-sm p-1">
                  {bsPeriods.map((p, i) => (
                    <button key={p.period} onClick={() => { setActiveIdx(i); setYtdEndIdx(-1); }}
                      className="px-4 py-1.5 rounded-lg text-xs font-bold transition-all"
                      style={{ background: activeIdx === i ? BRAND : "transparent", color: activeIdx === i ? "#fff" : "#6b7280" }}>
                      {p.period}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={exportFullReport}
                className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all hover:shadow-md active:scale-95"
                style={{ backgroundColor: BRAND, boxShadow: `0 2px 8px ${BRAND}40` }}>
                <Download size={15} /> Export
              </button>
            </div>
          </div>

          <>
              {/* ── YTD Selector Panel ─────────────────────────────────── */}
              {hasFinancialData && plCols.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-3.5 flex items-center gap-4 flex-wrap">
                  {/* Label */}
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 whitespace-nowrap">
                    YTD Range
                  </span>

                  {/* Single / YTD toggle */}
                  <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5 flex-shrink-0">
                    {(["Single","YTD"] as const).map(mode => (
                      <button key={mode}
                        onClick={() => setYtdMode(mode === "YTD")}
                        className="px-4 py-1.5 rounded-md text-[11px] font-semibold transition-all"
                        style={{
                          background: (mode === "YTD") === ytdMode ? BRAND : "transparent",
                          color:      (mode === "YTD") === ytdMode ? "white" : "#6b7280",
                        }}>
                        {mode}
                      </button>
                    ))}
                  </div>

                  {/* Month pills — 12 calendar slots, grayed if not in data */}
                  <div className="flex gap-1.5 flex-wrap">
                    {ALL_MONTHS_CONST.map((m, mi) => {
                      const colIdx = monthAvailability[mi]; // index in plCols, or -1
                      const available = colIdx >= 0;
                      const inRange   = ytdMode && available && colIdx <= effectiveYtdEnd;
                      const isEnd     = ytdMode && available && colIdx === effectiveYtdEnd;
                      return (
                        <button key={m}
                          disabled={!available}
                          onClick={() => { setYtdMode(true); setYtdEndIdx(colIdx); }}
                          title={available ? (ytdMode ? `YTD to ${m}` : `Select ${m}`) : "No data"}
                          className="px-3 py-1 rounded-full text-[11px] font-medium transition-all"
                          style={{
                            background: !available ? "#f3f4f6"
                              : isEnd    ? BRAND
                              : inRange  ? "#dbeafe"
                              : "white",
                            color: !available ? "#d1d5db"
                              : isEnd   ? "white"
                              : inRange ? BRAND
                              : "#6b7280",
                            border: `1px solid ${!available ? "#e5e7eb" : isEnd ? BRAND : inRange ? "#93c5fd" : "#e5e7eb"}`,
                            cursor: !available ? "default" : "pointer",
                          }}>
                          {m}
                        </button>
                      );
                    })}
                  </div>

                  {/* YTD range badge */}
                  {ytdMode && plCols.length > 0 && (
                    <span className="ml-auto whitespace-nowrap text-[11px] font-semibold px-3 py-1.5 rounded-lg flex-shrink-0"
                      style={{ background: "#dbeafe", color: BRAND }}>
                      YTD: {plCols[0]} → {plCols[effectiveYtdEnd]}
                      {ytdMonthCount != null && <span className="ml-1.5 opacity-60 font-normal">{ytdMonthCount}m</span>}
                    </span>
                  )}
                </div>
              )}

              {/* ════════════════════════════════════════════════════════
                   FINANCIAL REPORTS SECTION
              ════════════════════════════════════════════════════════ */}
              {hasFinancialData && (
                <div className="space-y-5">

                  {/* ── Section header ──────────────────────────────── */}
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
                    <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400 px-3">
                      {ytdRangeLabel
                        ? `Financial Reports — ${ytdRangeLabel}`
                        : `Financial Reports — ${bsP?.period ?? ""}`}
                    </span>
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
                  </div>

                  {/* ── 6 KPI Hero Cards ────────────────────────────── */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    {[
                      {
                        label: "Revenue", value: fmtM(revenue),
                        sub: ytdMode ? `${ytdMonthCount}-month YTD` : "Total period",
                        color: "#0891B2", bg: "linear-gradient(135deg,#ecfeff,#cffafe)",
                        border: "#0891B2", Icon: BarChart3,
                        change: revChange, showChange: !!prevPlP && !ytdMode,
                        ytd: ytdMode,
                      },
                      {
                        label: "Gross Profit", value: fmtM(grossProfit),
                        sub: ytdMode ? `Margin ${gpMargin.toFixed(1)}% · YTD` : `Margin ${gpMargin.toFixed(1)}%`,
                        color: "#059669", bg: "linear-gradient(135deg,#ecfdf5,#d1fae5)",
                        border: "#059669", Icon: TrendingUp,
                        change: 0, showChange: false, ytd: ytdMode,
                      },
                      {
                        label: "Net Profit", value: fmtM(netProfit),
                        sub: ytdMode ? `Margin ${netMargin.toFixed(1)}% · YTD` : `Margin ${netMargin.toFixed(1)}%`,
                        color: netProfit >= 0 ? "#059669" : "#DC2626",
                        bg: netProfit >= 0 ? "linear-gradient(135deg,#ecfdf5,#bbf7d0)" : "linear-gradient(135deg,#fef2f2,#fecaca)",
                        border: netProfit >= 0 ? "#059669" : "#DC2626",
                        Icon: netProfit >= 0 ? ArrowUpRight : ArrowDownRight,
                        change: netChange, showChange: !!prevPlP && !ytdMode, ytd: ytdMode,
                      },
                      {
                        label: "Total Assets", value: fmtM(totalAssets),
                        sub: `Equity ${fmtM(totalEquity)}`,
                        color: BRAND, bg: "linear-gradient(135deg,#eff6ff,#dbeafe)",
                        border: BRAND, Icon: PieChart,
                        change: assetsChange, showChange: !!prevBsP, ytd: false,
                      },
                      {
                        label: "Cash & Equiv.", value: fmtM(cashBs),
                        sub: ytdMode ? `Closing ${plCols[effectiveYtdEnd] ?? ""}` : "Closing balance",
                        color: "#7c3aed", bg: "linear-gradient(135deg,#f5f3ff,#ede9fe)",
                        border: "#7c3aed", Icon: Banknote,
                        change: 0, showChange: false, ytd: false,
                      },
                      {
                        label: "Operating CF", value: fmtM(operatingCF),
                        sub: ytdMode ? `${ytdMonthCount}-month YTD` : (operatingCF >= 0 ? "Positive" : "Negative"),
                        color: operatingCF >= 0 ? "#059669" : "#DC2626",
                        bg: operatingCF >= 0 ? "linear-gradient(135deg,#ecfdf5,#d1fae5)" : "linear-gradient(135deg,#fef2f2,#fecaca)",
                        border: operatingCF >= 0 ? "#059669" : "#DC2626",
                        Icon: operatingCF >= 0 ? ArrowUpRight : ArrowDownRight,
                        change: 0, showChange: false, ytd: ytdMode,
                      },
                    ].map(({ label, value, sub, color, bg, border, Icon, change, showChange, ytd }) => (
                      <div key={label} className="relative bg-white rounded-2xl shadow-sm overflow-hidden p-4 flex flex-col gap-2"
                        style={{ border: `1.5px solid ${border}20` }}>
                        <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: border }} />
                        <div className="flex items-center justify-between">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: bg, color: border }}>
                            <Icon size={16} />
                          </div>
                          {showChange && change !== 0 && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{ background: change > 0 ? "#ecfdf5" : "#fef2f2", color: change > 0 ? "#059669" : "#DC2626" }}>
                              {change > 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}%
                            </span>
                          )}
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
                          <p className="text-lg font-bold tabular-nums leading-tight" style={{ color }}>
                            SAR {value}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <p className="text-[10px] text-gray-400">{sub}</p>
                            {ytd && (
                              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                                style={{ background: "#dbeafe", color: BRAND }}>YTD</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* ── Charts Row ──────────────────────────────────── */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                    {/* ── Revenue Monthly Trend (Recharts BarChart) ── */}
                    <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100 lg:col-span-1">
                      <p className="text-sm font-bold text-gray-700">Monthly Revenue</p>
                      <p className="text-[11px] text-gray-400 mb-3">
                        SAR · {chartCols.join(", ")}
                        {ytdMode && <span className="ml-1.5 font-semibold" style={{ color: BRAND }}>(YTD)</span>}
                      </p>
                      {mounted && monthlyChartData.length > 0 ? (
                        <div style={{ height: 148 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={monthlyChartData} barGap={3} barCategoryGap="30%"
                              margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                              <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#9ca3af" }}
                                axisLine={false} tickLine={false} />
                              <YAxis hide />
                              <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f8faff" }} />
                              <Bar dataKey="Revenue" fill={BRAND} radius={[4,4,0,0]}
                                animationBegin={0} animationDuration={1100} animationEasing="ease-out" />
                              <Bar dataKey="Gross Profit" fill="#059669" radius={[4,4,0,0]}
                                animationBegin={150} animationDuration={1100} animationEasing="ease-out" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center" style={{ height: 148 }}>
                          <p className="text-xs text-gray-300">No monthly data</p>
                        </div>
                      )}
                      <div className="flex gap-4 pt-2 border-t border-gray-100 mt-1">
                        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm" style={{ background: BRAND }} /><span className="text-[10px] text-gray-400">Revenue</span></div>
                        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-[#059669]" /><span className="text-[10px] text-gray-400">Gross Profit</span></div>
                      </div>
                    </div>

                    {/* ── Asset Structure (Recharts PieChart donut) ── */}
                    <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
                      <p className="text-sm font-bold text-gray-700">Asset Structure</p>
                      <p className="text-[11px] text-gray-400 mb-3">Composition & Funding</p>
                      {mounted ? (
                        <div style={{ height: 118 }} className="relative">
                          <ResponsiveContainer width="100%" height="100%">
                            <RPieChart>
                              <Pie data={assetDonutData} cx="35%" cy="50%"
                                innerRadius={38} outerRadius={52} dataKey="value" paddingAngle={2}
                                animationBegin={0} animationDuration={1000} animationEasing="ease-out"
                                strokeWidth={0}>
                                {assetDonutData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                              </Pie>
                              <Tooltip content={<ChartTooltip />} />
                            </RPieChart>
                          </ResponsiveContainer>
                          {/* centre label */}
                          <div className="pointer-events-none absolute" style={{ top: "50%", left: "35%", transform: "translate(-50%,-50%)" }}>
                            <p className="text-[8px] text-gray-400 text-center leading-tight">ASSETS</p>
                            <p className="text-[11px] font-bold text-gray-800 text-center leading-tight">{fmtM(totalAssets)}</p>
                          </div>
                        </div>
                      ) : <div style={{ height: 118 }} />}
                      <div className="flex-1 space-y-2 mt-1">
                        {assetDonutData.map(s => {
                          const pct = totalAssets > 0 ? (s.value / Math.abs(totalAssets) * 100) : 0;
                          return (
                            <div key={s.name}>
                              <div className="flex justify-between text-[10px] mb-0.5">
                                <span className="text-gray-500">{s.name}</span>
                                <span className="font-bold" style={{ color: s.color }}>{pct.toFixed(1)}%</span>
                              </div>
                              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: s.color }} />
                              </div>
                              <p className="text-[10px] text-gray-400 mt-0.5 font-mono">SAR {fmtM(s.value)}</p>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-3 pt-3 border-t border-gray-100 flex gap-3">
                        {fundingDonutData.map(s => {
                          const pct = (totalEquity + totalLiab) > 0 ? (s.value / (Math.abs(totalEquity) + Math.abs(totalLiab)) * 100) : 0;
                          return (
                            <div key={s.name} className="flex-1 rounded-xl p-2.5" style={{ background: s.color + "14" }}>
                              <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: s.color }}>{s.name}</p>
                              <p className="text-xs font-bold font-mono mt-0.5" style={{ color: s.color }}>{fmtM(s.value)}</p>
                              <p className="text-[9px] text-gray-400">{pct.toFixed(1)}%</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* ── Cash Flow (Recharts horizontal BarChart) ── */}
                    <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
                      <p className="text-sm font-bold text-gray-700">Cash Flow Summary</p>
                      <p className="text-[11px] text-gray-400 mb-3">
                        SAR · {ytdRangeLabel ?? cfP?.period ?? bsP?.period}
                      </p>
                      {mounted ? (
                        <div style={{ height: 115 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart layout="vertical" data={cfChartData}
                              margin={{ top: 2, right: 60, left: 4, bottom: 2 }} barSize={18}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                              <XAxis type="number" hide />
                              <YAxis type="category" dataKey="name"
                                tick={{ fontSize: 10, fill: "#6b7280" }}
                                axisLine={false} tickLine={false} width={65} />
                              <Tooltip
                                content={({ active, payload }) => {
                                  if (!active || !payload?.length) return null;
                                  const d = cfChartData.find(c => c.name === payload[0].payload.name);
                                  return (
                                    <div className="rounded-xl shadow-lg border border-gray-100 bg-white px-3 py-2 text-[11px]">
                                      <p className="font-bold text-gray-700 mb-0.5">{d?.name} Activities</p>
                                      <p className="font-bold font-mono" style={{ color: d?.color }}>
                                        SAR {fmtNeg(d?.actual ?? 0)}
                                      </p>
                                    </div>
                                  );
                                }}
                                cursor={{ fill: "#f8faff" }} />
                              <Bar dataKey="value" radius={[0,5,5,0]}
                                animationBegin={0} animationDuration={1000} animationEasing="ease-out"
                                label={{ position: "right", fontSize: 9, fill: "#6b7280",
                                  formatter: (_: unknown) => ""
                                }}>
                                {cfChartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      ) : <div style={{ height: 115 }} />}
                        <div className="rounded-xl p-3 flex items-center justify-between mt-2"
                          style={{ background: closingCash >= 0 ? "#ecfdf5" : "#fef2f2", border: `1px solid ${closingCash >= 0 ? "#059669" : "#DC2626"}30` }}>
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-wide text-gray-500">Closing Cash</p>
                            <p className="text-[10px] text-gray-400">{cfP?.period ?? "Period end"}</p>
                          </div>
                          <p className="text-base font-bold font-mono tabular-nums"
                            style={{ color: closingCash >= 0 ? "#059669" : "#DC2626" }}>
                            SAR {fmtM(closingCash || cashBs)}
                          </p>
                        </div>
                    </div>
                  </div>

                  {/* ── P&L + Balance Sheet Side by Side ───────────── */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                    {/* P&L Summary */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                      <div className="px-5 py-3 flex items-center justify-between"
                        style={{ background: `linear-gradient(90deg, ${BRAND}, #2a5a9e)` }}>
                        <div className="flex items-center gap-2">
                          <TrendingUp size={15} className="text-white/70" />
                          <span className="text-sm font-bold text-white">Profit & Loss Summary</span>
                        </div>
                        <span className="text-white/60 text-[11px]">
                          {ytdRangeLabel ?? plP?.period}
                        </span>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {[
                          { label: "Total Revenue",       val: revenue,     color: BRAND,     bold: true,  indent: 0 },
                          { label: "Cost of Sales",       val: rowFind(ytdPlRows, "total cost of sales"), color: "#DC2626", bold: false, indent: 1 },
                          { label: "Gross Profit",        val: grossProfit,  color: "#059669", bold: true,  indent: 0 },
                          { label: "GP Margin",           val: gpMargin,     color: "#059669", bold: false, indent: 1, isRatio: true, suffix: "%" },
                          { label: "Operating Expenses",  val: rowFind(ytdPlRows, "total operating expenses"), color: "#D97706", bold: false, indent: 1 },
                          { label: "Operating Profit (EBIT)", val: ebit,     color: BRAND,     bold: true,  indent: 0 },
                          { label: "Finance Costs (Net)", val: rowFind(ytdPlRows, "finance costs"), color: "#DC2626", bold: false, indent: 1 },
                          { label: "Net Profit Before Tax", val: rowFind(ytdPlRows, "net profit before tax"), color: BRAND, bold: true, indent: 0 },
                          { label: "Zakat & Tax",         val: rowFind(ytdPlRows, "zakat"), color: "#DC2626", bold: false, indent: 1 },
                          { label: "Net Profit After Tax",val: netProfit,    color: netProfit >= 0 ? "#059669" : "#DC2626", bold: true, indent: 0 },
                          { label: "Net Margin",          val: netMargin,    color: netProfit >= 0 ? "#059669" : "#DC2626", bold: false, indent: 1, isRatio: true, suffix: "%" },
                        ].map(({ label, val, color, bold, indent, isRatio, suffix }) => (
                          <div key={label}
                            className={`flex items-center px-5 py-2.5 text-[12px] ${bold ? "font-bold" : ""}`}
                            style={{ background: bold ? "#fafbff" : "white" }}>
                            <span className="flex-1 truncate" style={{ color: bold ? "#1f2937" : "#6b7280", paddingLeft: indent * 16 }}>
                              {label}
                            </span>
                            <span className="font-mono tabular-nums" style={{ color: val < 0 ? "#DC2626" : color }}>
                              {isRatio ? `${Math.abs(val).toFixed(1)}${suffix ?? ""}` : `SAR ${fmtNeg(val)}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Balance Sheet Highlights */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                      <div className="px-5 py-3 flex items-center justify-between"
                        style={{ background: "linear-gradient(90deg, #374151, #4b5563)" }}>
                        <div className="flex items-center gap-2">
                          <PieChart size={15} className="text-white/70" />
                          <span className="text-sm font-bold text-white">Balance Sheet Highlights</span>
                        </div>
                        <span className="text-white/60 text-[11px]">{bsP?.period}</span>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {[
                          { label: "ASSETS",             val: null,         section: true },
                          { label: "Current Assets",     val: currAssets,    color: BRAND,     indent: 1 },
                          { label: "Non-Current Assets", val: nonCurrAssets, color: "#2a5a9e", indent: 1 },
                          { label: "Total Assets",       val: totalAssets,   color: BRAND,     bold: true, indent: 0 },
                          { label: "LIABILITIES",        val: null,         section: true },
                          { label: "Current Liabilities",val: currLiab,     color: "#DC2626", indent: 1 },
                          { label: "Non-Current Liabilities", val: nonCurrLiab, color: "#ef4444", indent: 1 },
                          { label: "Total Liabilities",  val: totalLiab,    color: "#DC2626", bold: true, indent: 0 },
                          { label: "EQUITY",             val: null,         section: true },
                          { label: "Paid-up Capital",    val: paidCapital,  color: "#059669", indent: 1 },
                          { label: "Retained Earnings",  val: retainedEarnings, color: retainedEarnings >= 0 ? "#059669" : "#DC2626", indent: 1 },
                          { label: "Total Equity",       val: totalEquity,  color: "#059669", bold: true, indent: 0 },
                        ].map(({ label, val, section, color, bold, indent }) => {
                          if (section) {
                            return (
                              <div key={label} className="px-5 py-1.5 text-[10px] font-bold uppercase tracking-widest"
                                style={{ background: "#f8fafc", color: "#374151" }}>{label}</div>
                            );
                          }
                          return (
                            <div key={label}
                              className={`flex items-center px-5 py-2.5 text-[12px] ${bold ? "font-bold bg-gray-50/60" : "hover:bg-gray-50/40"}`}>
                              <span className="flex-1 text-gray-600" style={{ paddingLeft: (indent ?? 0) * 16 }}>{label}</span>
                              <span className="font-mono tabular-nums" style={{ color: (val ?? 0) < 0 ? "#DC2626" : (color ?? "#374151") }}>
                                SAR {fmtNeg(val ?? 0)}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Ratios */}
                      <div className="grid grid-cols-2 gap-px border-t border-gray-100 mt-1">
                        {[
                          { label: "Current Ratio",  val: currentRatio.toFixed(2), good: currentRatio >= 1, unit: "×" },
                          { label: "Debt / Equity",  val: debtToEquity.toFixed(2), good: debtToEquity <= 1.5, unit: "×" },
                        ].map(({ label, val, good, unit }) => (
                          <div key={label} className="px-5 py-3 flex items-center justify-between"
                            style={{ background: good ? "#f0fdf4" : "#fef2f2" }}>
                            <p className="text-[10px] text-gray-500 font-medium">{label}</p>
                            <p className="text-sm font-bold font-mono" style={{ color: good ? "#059669" : "#DC2626" }}>
                              {val}{unit}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* ── Tax Summary Strip ───────────────────────────── */}
                  {taxRows.length > 0 && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2"
                        style={{ background: "linear-gradient(90deg,#7c3aed15,#6d28d915)" }}>
                        <Receipt size={15} className="text-purple-600" />
                        <span className="text-[11px] font-bold uppercase tracking-widest text-purple-700">
                          Tax Summary — {taxP?.period}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-gray-100">
                        {[
                          { label: "Zakat Payable",    val: taxZakat,  color: "#7c3aed" },
                          { label: "Net VAT Payable",  val: taxVatNet, color: "#0891B2" },
                          { label: "WHT Withheld",     val: taxWht,    color: "#D97706" },
                          { label: "Total Tax Paid",   val: taxTotal,  color: "#DC2626" },
                        ].map(({ label, val, color }) => (
                          <div key={label} className="px-5 py-4">
                            <p className="text-[10px] text-gray-400 mb-1">{label}</p>
                            <p className="text-base font-bold font-mono tabular-nums" style={{ color }}>
                              SAR {fmtN(val)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── P&L Section Breakdown ──────────────────────── */}
                  {plSections.length > 0 && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                      <div className="px-5 py-3 flex items-center gap-2 border-b border-gray-100"
                        style={{ background: `linear-gradient(90deg,${BRAND}15,${BRAND}05)` }}>
                        <BarChart3 size={14} style={{ color: BRAND }} />
                        <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: BRAND }}>
                          P&amp;L Section Breakdown — {ytdRangeLabel ?? plP?.period}
                        </span>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {plSections.map(({ label, value }) => (
                          <div key={label} className="flex items-center justify-between px-5 py-2.5 hover:bg-gray-50/60">
                            <span className="text-[12px] text-gray-600 truncate max-w-[60%]">{label}</span>
                            <span className="text-[12px] font-mono font-semibold tabular-nums"
                              style={{ color: value < 0 ? "#DC2626" : BRAND }}>
                              SAR {value < 0
                                ? `(${Math.abs(value).toLocaleString("en-US",{maximumFractionDigits:0})})`
                                : value.toLocaleString("en-US",{maximumFractionDigits:0})}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Trial Balance ──────────────────────────────── */}
                  {tbRows.length > 0 && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                      <div className="px-5 py-3 flex items-center justify-between"
                        style={{ background: "linear-gradient(90deg,#0f766e18,#0d948518)" }}>
                        <div className="flex items-center gap-2">
                          <span style={{ fontSize: 15, color: "#0f766e" }}>⚖</span>
                          <span className="text-[11px] font-bold uppercase tracking-widest text-teal-700">
                            Trial Balance — {tbPeriod || tbP?.period}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-gray-400">{tbAccountCount} accounts</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tbBalanced ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                            {tbBalanced ? "BALANCED ✓" : "UNBALANCED !"}
                          </span>
                        </div>
                      </div>

                      {/* Summary strip */}
                      <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
                        {[
                          { label: "Total Debits",  val: tbTotalDebit,  color: BRAND },
                          { label: "Total Credits", val: tbTotalCredit, color: "#DC2626" },
                          { label: "Net Balance",   val: tbTotalDebit - tbTotalCredit, color: Math.abs(tbTotalDebit - tbTotalCredit) < 1 ? "#059669" : "#DC2626" },
                        ].map(({ label, val, color }) => (
                          <div key={label} className="px-5 py-3">
                            <p className="text-[10px] text-gray-400 mb-0.5">{label}</p>
                            <p className="text-sm font-bold font-mono tabular-nums" style={{ color }}>
                              SAR {fmtN(Math.abs(val))}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* Account list (scrollable) — multi-column for new format */}
                      <div className="overflow-auto" style={{ maxHeight: 340 }}>
                        <table className="w-full text-[11px]" style={{ minWidth: tbIsNew ? 640 : "auto" }}>
                          <thead className="sticky top-0 z-10">
                            <tr style={{ background: "#f8fafc" }}>
                              <th className="text-left px-4 py-2 font-bold text-gray-500 sticky left-0 bg-[#f8fafc]">Account</th>
                              {tbIsNew ? (
                                <>
                                  <th className="text-right px-3 py-2 font-bold text-gray-500">Opening</th>
                                  <th className="text-right px-3 py-2 font-bold text-gray-500">Debits</th>
                                  <th className="text-right px-3 py-2 font-bold text-gray-500">Credits</th>
                                  <th className="text-right px-3 py-2 font-bold text-gray-500">Closing</th>
                                </>
                              ) : (
                                <th className="text-right px-5 py-2 font-bold text-gray-500">Closing (SAR)</th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {tbRows.map((row, i) => {
                              const vals = (row as {values?:(number|null)[]}).values;
                              if (row.type === "section") return (
                                <tr key={i} style={{ background: "#eef2f9" }}>
                                  <td colSpan={tbIsNew ? 5 : 2} className="px-4 py-1.5 font-bold text-[10px] uppercase tracking-wider" style={{ color: BRAND }}>
                                    {row.label}
                                  </td>
                                </tr>
                              );
                              if (row.type === "total") return (
                                <tr key={i} style={{ background: "#f0f4fa", borderTop: "1px solid #d1dcea" }}>
                                  <td className="px-4 py-1.5 font-bold text-[11px] sticky left-0 bg-[#f0f4fa]" style={{ color: BRAND, paddingLeft: `${(row.indent??0)*12+16}px` }}>
                                    {row.label}
                                  </td>
                                  {tbIsNew && vals ? (
                                    [0,1,2,4].map(vi => (
                                      <td key={vi} className="px-3 py-1.5 text-right font-mono font-bold tabular-nums" style={{ color: (vals[vi]??0)<0?"#DC2626":BRAND }}>
                                        {vals[vi]!==null ? fmtNeg(vals[vi]!) : "—"}
                                      </td>
                                    ))
                                  ) : (
                                    <td className="px-5 py-1.5 text-right font-mono font-bold tabular-nums" style={{ color: BRAND }}>{fmtNeg(row.value??0)}</td>
                                  )}
                                </tr>
                              );
                              return (
                                <tr key={i} style={{ background: i%2===0?"#fff":"#fafbfc" }}
                                  className="hover:bg-blue-50/30 transition-colors">
                                  <td className="px-4 py-1.5 text-gray-600 sticky left-0" style={{ background:"inherit", paddingLeft:`${(row.indent??0)*12+12}px` }}>
                                    {row.label}
                                  </td>
                                  {tbIsNew && vals ? (
                                    [0,1,2,4].map(vi => (
                                      <td key={vi} className="px-3 py-1.5 text-right font-mono tabular-nums" style={{ color: (vals[vi]??0)<0?"#DC2626":(vals[vi]??0)===0?"#d1d5db":"#374151" }}>
                                        {vals[vi]!==null&&vals[vi]!==0 ? fmtNeg(vals[vi]!) : "—"}
                                      </td>
                                    ))
                                  ) : (
                                    <td className="px-5 py-1.5 text-right font-mono tabular-nums" style={{ color:(row.value??0)<0?"#DC2626":BRAND }}>
                                      {row.value!==null ? fmtNeg(row.value) : "—"}
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* ── Period Comparison (if 2 periods) ──────────── */}
                  {bsPeriods.length >= 2 && plPeriods.length >= 2 && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2"
                        style={{ background: `linear-gradient(90deg,${BRAND}15,${BRAND}05)` }}>
                        <FileText size={15} style={{ color: BRAND }} />
                        <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: BRAND }}>
                          Period Comparison
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[12px] min-w-[600px]">
                          <thead>
                            <tr className="text-[10px] uppercase tracking-wide text-gray-500 border-b border-gray-100 bg-gray-50/60">
                              <th className="px-5 py-3 text-left font-semibold w-48">Metric</th>
                              {bsPeriods.map(p => (
                                <th key={p.period} className="px-5 py-3 text-right font-semibold">{p.period}</th>
                              ))}
                              <th className="px-5 py-3 text-right font-semibold">Change</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              { label: "Revenue",       vals: plPeriods.map(p => rowFind(p.rows ?? [], "total revenue")),    format: "sar" },
                              { label: "Gross Profit",  vals: plPeriods.map(p => rowFind(p.rows ?? [], "gross profit")),     format: "sar" },
                              { label: "GP Margin %",   vals: plPeriods.map(p => {
                                const r = rowFind(p.rows ?? [], "total revenue"); const g = rowFind(p.rows ?? [], "gross profit");
                                return r > 0 ? g / r * 100 : 0;
                              }), format: "pct" },
                              { label: "Net Profit",    vals: plPeriods.map(p => rowFind(p.rows ?? [], "net profit after tax")), format: "sar" },
                              { label: "Net Margin %",  vals: plPeriods.map(p => {
                                const r = rowFind(p.rows ?? [], "total revenue"); const n = rowFind(p.rows ?? [], "net profit after tax");
                                return r > 0 ? n / r * 100 : 0;
                              }), format: "pct" },
                              { label: "Total Assets",  vals: bsPeriods.map(p => bsFind(p.bs ?? [], "total assets")),        format: "sar" },
                              { label: "Total Equity",  vals: bsPeriods.map(p => bsFind(p.bs ?? [], "total equity")),        format: "sar" },
                              { label: "Cash & Equiv.", vals: bsPeriods.map(p => bsFind(p.bs ?? [], "cash & cash equivalents")), format: "sar" },
                            ].map(({ label, vals, format }) => {
                              const change = vals.length >= 2 && vals[0] !== 0 ? ((vals[1] - vals[0]) / Math.abs(vals[0])) * 100 : 0;
                              return (
                                <tr key={label} className="border-b border-gray-50 hover:bg-gray-50/60">
                                  <td className="px-5 py-2.5 font-medium text-gray-700">{label}</td>
                                  {vals.map((v, i) => (
                                    <td key={i} className="px-5 py-2.5 text-right tabular-nums font-mono font-semibold"
                                      style={{ color: v < 0 ? "#DC2626" : BRAND }}>
                                      {format === "pct" ? `${v.toFixed(1)}%` : `SAR ${fmtNeg(v)}`}
                                    </td>
                                  ))}
                                  <td className="px-5 py-2.5 text-right">
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
                                      style={{ background: change > 0 ? "#ecfdf5" : change < 0 ? "#fef2f2" : "#f3f4f6", color: change > 0 ? "#059669" : change < 0 ? "#DC2626" : "#9ca3af" }}>
                                      {change > 0 ? "▲" : change < 0 ? "▼" : "—"} {change !== 0 ? `${Math.abs(change).toFixed(1)}%` : "—"}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* empty state */}
              {!hasFinancialData && (
                <div className="flex flex-col items-center justify-center py-24 gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl"
                    style={{ background: `${BRAND}15` }}>
                    <BarChart3 size={28} style={{ color: BRAND }} />
                  </div>
                  <p className="text-base font-semibold text-gray-600">No financial data yet</p>
                  <p className="text-sm text-gray-400 text-center max-w-sm">
                    Upload financial reports in the Financial Reports section, or select a company with existing data.
                  </p>
                  <Link href="/dashboard/account"
                    className="px-6 py-2.5 rounded-xl text-sm font-bold text-white"
                    style={{ background: BRAND }}>
                    Go to Financial Reports →
                  </Link>
                </div>
              )}
            </>
        </div>
      </main>

      {/* J.A.R.V.I.S floating assistant */}
      <JarvisAssistant data={{
        company:        coName(frCompany),
        period:         ytdRangeLabel ?? (revenue > 0 ? plP?.period : null) ?? bsP?.period ?? cfP?.period ?? "—",
        revenue,
        grossProfit,
        netProfit,
        gpMargin,
        netMargin,
        ebit,
        totalAssets,
        totalEquity,
        totalLiab,
        cashBs,
        currAssets,
        currLiab,
        operatingCF,
        investingCF,
        financingCF,
        closingCash,
        currentRatio,
        debtToEquity,
        taxTotal,
        tbPeriod:       tbP?.period,
        tbAccountCount,
        tbTotalDebit,
        tbTotalCredit,
        tbBalanced,
        plSections,
        cfSections,
        onExport:       exportFullReport,
      }} />
    </div>
  );
}
