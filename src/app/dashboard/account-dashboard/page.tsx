"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LogOut, ChevronRight, LayoutDashboard,
  TrendingUp, TrendingDown, Wallet, CreditCard,
  ArrowUpRight, ArrowDownRight, Download,
} from "lucide-react";
import CompanySelector, { COMPANIES } from "@/components/company-selector";
import * as XLSX from "xlsx-js-style";
import { applyStyles } from "@/lib/excel-styles";
import type { PeriodFile } from "@/app/api/account/route";

const BRAND = "#1B3A6B";
const PIE_R  = 70;
const PIE_C  = 2 * Math.PI * PIE_R;

// ── helpers ──────────────────────────────────────────────────────────────────
const num   = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const coName = (id: string) => COMPANIES.find(c => c.id === id)?.name ?? id;
const isAr   = (s: string) => /[؀-ۿ]/.test(s);

// ── metric config ─────────────────────────────────────────────────────────────
const METRICS = [
  { key: "income",      label: "Income",      color: "#059669", bg: "#ECFDF5", Icon: TrendingUp,  href: "/dashboard/account/current-income"      },
  { key: "payables",    label: "Payables",    color: "#DC2626", bg: "#FEF2F2", Icon: TrendingDown, href: "/dashboard/account/current-payables"    },
  { key: "receivables", label: "Receivables", color: "#0891B2", bg: "#ECFEFF", Icon: Wallet,       href: "/dashboard/account/current-receivables" },
  { key: "expenses",    label: "Expenses",    color: "#D97706", bg: "#FFFBEB", Icon: CreditCard,   href: "/dashboard/account/current-expenses"    },
] as const;

type MetricKey = "income" | "payables" | "receivables" | "expenses";

interface PerCompany {
  income:      number;
  payables:    number;
  receivables: number;
  expenses:    number;
  rows:        Record<MetricKey, Array<{ amount: string; month: string; [k: string]: string }>>;
}

// ── component ─────────────────────────────────────────────────────────────────
export default function AccountDashboardPage() {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [data, setData]               = useState<Record<string, PerCompany>>({});
  const [loading, setLoading]         = useState(true);

  // Balance Sheet & Cash Flow periods (stored via /dashboard/account upload)
  const [bsPeriods,    setBsPeriods]    = useState<PeriodFile[]>([]);
  const [activePeriod, setActivePeriod] = useState(0);
  const [view,         setView]         = useState<"dashboard" | "summary">("dashboard");
  const [bsCompany,    setBsCompany]    = useState<string>("madina");

  useEffect(() => {
    function load() {
      setLoading(true);

      const raw = localStorage.getItem("selected_companies");
      const ids: string[] = raw ? JSON.parse(raw) : ["diamond-star"];
      setSelectedIds(ids);

      type DataMap = Record<string, { rows: Array<{ amount: string; month: string; [k: string]: string }>; total: number }>;
      const parse = (key: string): DataMap => JSON.parse(localStorage.getItem(key) ?? "{}");
      const incMap = parse("account_income");
      const payMap = parse("account_payables");
      const recMap = parse("account_receivables");
      const expMap = parse("account_expenses");

      const built: Record<string, PerCompany> = {};
      ids.forEach(id => {
        built[id] = {
          income:      incMap?.[id]?.total ?? 0,
          payables:    payMap?.[id]?.total ?? 0,
          receivables: recMap?.[id]?.total ?? 0,
          expenses:    expMap?.[id]?.total ?? 0,
          rows: {
            income:      incMap?.[id]?.rows ?? [],
            payables:    payMap?.[id]?.rows ?? [],
            receivables: recMap?.[id]?.rows ?? [],
            expenses:    expMap?.[id]?.rows ?? [],
          },
        };
      });
      setData(built);
      setBsCompany(ids[0] ?? "madina");
      setLoading(false);
    }

    load();

    // Re-fetch whenever the user changes company selection
    window.addEventListener("companiesChanged", load);
    return () => window.removeEventListener("companiesChanged", load);
  }, []);

  // Fetch BS/CF periods for the currently selected company
  useEffect(() => {
    if (!bsCompany) return;
    fetch(`/api/account?company=${bsCompany}`)
      .then(r => r.json())
      .then(d => { setBsPeriods(d.periods ?? []); setActivePeriod(0); })
      .catch(() => {});
  }, [bsCompany]);

  // ── aggregated totals across all selected companies ─────────────────────────
  const totals = useMemo(() => {
    const t = { income: 0, payables: 0, receivables: 0, expenses: 0 };
    selectedIds.forEach(id => {
      const d = data[id];
      if (d) {
        t.income      += d.income;
        t.payables    += d.payables;
        t.receivables += d.receivables;
        t.expenses    += d.expenses;
      }
    });
    return t;
  }, [selectedIds, data]);

  const netBalance = (totals.income + totals.receivables) - (totals.payables + totals.expenses);
  const grandTotal = totals.income + totals.payables + totals.receivables + totals.expenses;

  // ── pie segments (single company detail / combined) ─────────────────────────
  const pieVals = [totals.income, totals.payables, totals.receivables, totals.expenses];
  let pieAcc = 0;
  const pieSegs = pieVals.map((v, i) => {
    const len    = grandTotal > 0 ? (v / grandTotal) * PIE_C : 0;
    const offset = PIE_C * 0.25 - pieAcc;
    pieAcc += len;
    return { color: METRICS[i].color, len, offset };
  });

  // ── monthly breakdown (combined across all selected) ───────────────────────
  const { chartMonths, monthlyMap, maxBarVal } = useMemo(() => {
    const mm: Record<string, number[]> = {};
    selectedIds.forEach(id => {
      const d = data[id];
      if (!d) return;
      METRICS.forEach(({ key }, ci) => {
        d.rows[key].forEach(row => {
          if (!mm[row.month]) mm[row.month] = [0, 0, 0, 0];
          mm[row.month][ci] += num(row.amount);
        });
      });
    });
    const sorted = Object.keys(mm).sort((a, b) => {
      const p = (s: string) => new Date(`${s.split(" ")[0]} 1, ${s.split(" ")[1]}`).getTime();
      return p(a) - p(b);
    });
    const months = sorted.slice(-6);
    const maxV   = Math.max(1, ...months.map(m => mm[m].reduce((s, v) => s + v, 0)));
    return { chartMonths: months, monthlyMap: mm, maxBarVal: maxV };
  }, [selectedIds, data]);

  const isSingle = selectedIds.length === 1;

  // ── BS/CF helpers ──────────────────────────────────────────────────────────
  function bsVal(p: PeriodFile, ...labels: string[]) {
    for (const l of labels) {
      const row = p.bs.find(r => r.label.toLowerCase().trim() === l.toLowerCase().trim());
      if (row && row.value !== null) return row.value;
    }
    return 0;
  }
  function cfVal(p: PeriodFile, ...labels: string[]) {
    for (const l of labels) {
      const row = p.cf.find(r => r.label.toLowerCase().trim() === l.toLowerCase().trim());
      if (row && row.value !== null) return row.value;
    }
    return 0;
  }
  // Flexible partial-match helpers for BS/CF rows (handles label variations)
  function bsFindAny(p: PeriodFile, ...keys: string[]): number {
    for (const k of keys) {
      const row = p.bs.find(r => r.label.toLowerCase().includes(k.toLowerCase()));
      if (row && row.value !== null) return row.value;
    }
    return 0;
  }
  function cfFindAny(p: PeriodFile, ...keys: string[]): number {
    for (const k of keys) {
      const row = p.cf.find(r => r.label.toLowerCase().includes(k.toLowerCase()));
      if (row && row.value !== null) return row.value;
    }
    return 0;
  }
  function periodKpis(p: PeriodFile) {
    return {
      totalAssets:      bsVal(p, "total assets"),
      totalEquity:      bsVal(p, "total equity"),
      totalLiabilities: bsVal(p, "total liabilities", "total liabilities "),
      cash:             bsVal(p, "bank balances and cash"),
      currentAssets:    bsVal(p, "total current assets"),
      nonCurrentAssets: bsVal(p, "total non current assets"),
      operatingCF:      cfVal(p, "net cash from operating activities"),
      investingCF:      cfVal(p, "net cash from investing activities"),
      financingCF:      cfVal(p, "net cash (used in)/from financing activities"),
      netIncome:        cfVal(p, "net income before zakat and income tax"),
      closingCash:      cfVal(p, "closing cash and bank"),
    };
  }

  function exportFullReport() {
    const wb = XLSX.utils.book_new();
    const dateStr = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
    const timeStr = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

    type HEntry = { id: string; companyId: string; companyName: string; savedAt: string; rows: Record<string, string>[]; total: number };
    const parseHist = (key: string): HEntry[] => { try { return JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { return []; } };

    const incHist = parseHist("account_income_history");
    const payHist = parseHist("account_payables_history");
    const recHist = parseHist("account_receivables_history");
    const expHist = parseHist("account_expenses_history");

    const numV = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
    const monV = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // ── Sheet 1: Combined Summary ──────────────────────────────────────────
    const incTotal = incHist.reduce((s, e) => s + e.total, 0);
    const payTotal = payHist.reduce((s, e) => s + e.total, 0);
    const recTotal = recHist.reduce((s, e) => s + e.total, 0);
    const expTotal = expHist.reduce((s, e) => s + e.total, 0);
    const netBal   = (incTotal + recTotal) - (payTotal + expTotal);

    const ws1Data: (string | number | null)[][] = [
      ["NAMMA DASHBOARD — FULL FINANCIAL REPORT", null, null, null],
      [`Generated: ${dateStr} ${timeStr}`, null, null, null],
      [],
      ["SUMMARY", null, null, null],
      [],
      ["Category", "Submissions", "Total Entries", "Total (SAR)"],
      ["Income",      incHist.length, incHist.reduce((s,e)=>s+e.rows.length,0), incTotal],
      ["Payables",    payHist.length, payHist.reduce((s,e)=>s+e.rows.length,0), payTotal],
      ["Receivables", recHist.length, recHist.reduce((s,e)=>s+e.rows.length,0), recTotal],
      ["Expenses",    expHist.length, expHist.reduce((s,e)=>s+e.rows.length,0), expTotal],
      [],
      ["Net Balance (Income + Receivables − Payables − Expenses)", null, null, netBal],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(ws1Data);
    ws1["!cols"] = [{ wch: 50 }, { wch: 16 }, { wch: 16 }, { wch: 18 }];
    applyStyles(ws1, { metaEnd: 1, headerRow: 5, dataStart: 6, dataEnd: 9, totalRow: 11, amountCols: [3], accent: "1B3A6B", colCount: 4 });
    XLSX.utils.book_append_sheet(wb, ws1, "Summary");

    // ── Sheet 2: All Income ────────────────────────────────────────────────
    const incRows: (string | number)[][] = [];
    let rn = 1;
    incHist.forEach(e => e.rows.forEach((r: Record<string,string>) => incRows.push([
      rn++, e.companyName, r.bankName ?? "", r.month, numV(r.amount),
      new Date(e.savedAt).toLocaleDateString("en-GB"),
    ])));
    const ws2Data: (string | number | null)[][] = [
      ["INCOME REPORT", null, null, null, null, null],
      [`Grand Total: SAR ${monV(incTotal)}`, null, null, null, null, null],
      [],
      ["#", "Company", "Bank Name", "Month", "Amount (SAR)", "Saved Date"],
      ...incRows,
      [], [null, null, null, "TOTAL SAR", incTotal, null],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(ws2Data);
    ws2["!cols"] = [{ wch: 5 }, { wch: 40 }, { wch: 26 }, { wch: 20 }, { wch: 18 }, { wch: 16 }];
    applyStyles(ws2, { metaEnd: 1, headerRow: 3, dataStart: 4, dataEnd: 3 + incRows.length, totalRow: 5 + incRows.length, amountCols: [4], accent: "059669", colCount: 6 });
    XLSX.utils.book_append_sheet(wb, ws2, "Income");

    // ── Sheet 3: All Payables ──────────────────────────────────────────────
    const payRows: (string | number)[][] = [];
    rn = 1;
    payHist.forEach(e => e.rows.forEach((r: Record<string,string>) => payRows.push([
      rn++, e.companyName, r.customerName ?? "", r.month, numV(r.amount),
      new Date(e.savedAt).toLocaleDateString("en-GB"),
    ])));
    const ws3Data: (string | number | null)[][] = [
      ["PAYABLES REPORT", null, null, null, null, null],
      [`Grand Total: SAR ${monV(payTotal)}`, null, null, null, null, null],
      [],
      ["#", "Company", "Customer Name", "Month", "Amount (SAR)", "Saved Date"],
      ...payRows,
      [], [null, null, null, "TOTAL SAR", payTotal, null],
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(ws3Data);
    ws3["!cols"] = [{ wch: 5 }, { wch: 40 }, { wch: 28 }, { wch: 20 }, { wch: 18 }, { wch: 16 }];
    applyStyles(ws3, { metaEnd: 1, headerRow: 3, dataStart: 4, dataEnd: 3 + payRows.length, totalRow: 5 + payRows.length, amountCols: [4], accent: "DC2626", colCount: 6 });
    XLSX.utils.book_append_sheet(wb, ws3, "Payables");

    // ── Sheet 4: All Receivables ───────────────────────────────────────────
    const recRows: (string | number)[][] = [];
    rn = 1;
    recHist.forEach(e => e.rows.forEach((r: Record<string,string>) => recRows.push([
      rn++, e.companyName, r.clientName ?? "", r.month, numV(r.amount),
      new Date(e.savedAt).toLocaleDateString("en-GB"),
    ])));
    const ws4Data: (string | number | null)[][] = [
      ["RECEIVABLES REPORT", null, null, null, null, null],
      [`Grand Total: SAR ${monV(recTotal)}`, null, null, null, null, null],
      [],
      ["#", "Company", "Client Name", "Month", "Amount (SAR)", "Saved Date"],
      ...recRows,
      [], [null, null, null, "TOTAL SAR", recTotal, null],
    ];
    const ws4 = XLSX.utils.aoa_to_sheet(ws4Data);
    ws4["!cols"] = [{ wch: 5 }, { wch: 40 }, { wch: 28 }, { wch: 20 }, { wch: 18 }, { wch: 16 }];
    applyStyles(ws4, { metaEnd: 1, headerRow: 3, dataStart: 4, dataEnd: 3 + recRows.length, totalRow: 5 + recRows.length, amountCols: [4], accent: "0891B2", colCount: 6 });
    XLSX.utils.book_append_sheet(wb, ws4, "Receivables");

    // ── Sheet 5: All Expenses ──────────────────────────────────────────────
    const expRows: (string | number)[][] = [];
    rn = 1;
    expHist.forEach(e => e.rows.forEach((r: Record<string,string>) => expRows.push([
      rn++, e.companyName, r.expenseName ?? "", r.month, numV(r.amount),
      new Date(e.savedAt).toLocaleDateString("en-GB"),
    ])));
    const ws5Data: (string | number | null)[][] = [
      ["EXPENSES REPORT", null, null, null, null, null],
      [`Grand Total: SAR ${monV(expTotal)}`, null, null, null, null, null],
      [],
      ["#", "Company", "Expense Name", "Month", "Amount (SAR)", "Saved Date"],
      ...expRows,
      [], [null, null, null, "TOTAL SAR", expTotal, null],
    ];
    const ws5 = XLSX.utils.aoa_to_sheet(ws5Data);
    ws5["!cols"] = [{ wch: 5 }, { wch: 40 }, { wch: 28 }, { wch: 20 }, { wch: 18 }, { wch: 16 }];
    applyStyles(ws5, { metaEnd: 1, headerRow: 3, dataStart: 4, dataEnd: 3 + expRows.length, totalRow: 5 + expRows.length, amountCols: [4], accent: "D97706", colCount: 6 });
    XLSX.utils.book_append_sheet(wb, ws5, "Expenses");

    // ── Sheet 6: Monthly Breakdown (chart-ready) ───────────────────────────
    const monthAll: Record<string, number[]> = {};
    const addToMonth = (hist: HEntry[], idx: number, field: string) => {
      hist.forEach(e => e.rows.forEach((r: Record<string,string>) => {
        if (!monthAll[r.month]) monthAll[r.month] = [0,0,0,0];
        monthAll[r.month][idx] += numV(r.amount);
      }));
    };
    addToMonth(incHist, 0, "amount");
    addToMonth(payHist, 1, "amount");
    addToMonth(recHist, 2, "amount");
    addToMonth(expHist, 3, "amount");
    const sortedMonths = Object.entries(monthAll).sort((a, b) => {
      const p = (s: string) => new Date(`${s.split(" ")[0]} 1, ${s.split(" ")[1]}`).getTime();
      return p(a[0]) - p(b[0]);
    });
    const ws6Data: (string | number | null)[][] = [
      ["MONTHLY BREAKDOWN — CHART DATA", null, null, null, null],
      ["Tip: Select all columns → Insert → Chart (Stacked Bar)", null, null, null, null],
      [],
      ["Month", "Income (SAR)", "Payables (SAR)", "Receivables (SAR)", "Expenses (SAR)"],
      ...sortedMonths.map(([m, v]) => [m, v[0], v[1], v[2], v[3]]),
    ];
    const ws6 = XLSX.utils.aoa_to_sheet(ws6Data);
    ws6["!cols"] = [{ wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
    applyStyles(ws6, { metaEnd: 1, headerRow: 3, dataStart: 4, dataEnd: 3 + sortedMonths.length, amountCols: [1, 2, 3, 4], accent: "1B3A6B", colCount: 5 });
    XLSX.utils.book_append_sheet(wb, ws6, "Monthly Breakdown");

    XLSX.writeFile(wb, `Full_Financial_Report_${new Date().toISOString().split("T")[0]}.xlsx`);
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#F4F6FA" }}>

      {/* Header */}
      <header className="w-full flex items-center justify-between px-6 py-3 shadow-md gap-4 relative z-20" style={{ backgroundColor: BRAND }}>
        <Image src="/logo.png" alt="Diamond Star Arabia" width={110} height={65} className="object-contain brightness-0 invert flex-shrink-0" />
        <div className="flex-1 flex justify-center"><CompanySelector /></div>
        <button onClick={() => router.push("/login")} className="flex items-center gap-2 text-white/80 hover:text-white text-sm font-medium transition-colors flex-shrink-0">
          <LogOut size={16} /> Log out
        </button>
      </header>

      <main className="flex-1 w-full px-4 md:px-8 py-8">
        <div className="mx-auto max-w-6xl">

          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-xs text-gray-400 mb-4">
            <Link href="/dashboard" className="hover:text-[#1B3A6B] transition-colors">Dashboard</Link>
            <ChevronRight size={12} />
            <Link href="/dashboard/finance" className="hover:text-[#1B3A6B] transition-colors">Finance</Link>
            <ChevronRight size={12} />
            {view === "summary" ? (
              <>
                <button onClick={() => setView("dashboard")} className="hover:text-[#1B3A6B] transition-colors">Account Dashboard</button>
                <ChevronRight size={12} />
                <span className="text-gray-600 font-medium">Summary</span>
              </>
            ) : (
              <span className="text-gray-600 font-medium">Account Dashboard</span>
            )}
          </nav>

          {/* Dashboard / Summary tabs — only visible when BS data is uploaded */}
          {bsPeriods.length > 0 && (
            <div className="flex gap-1 bg-white rounded-xl border border-gray-100 shadow-sm p-1 w-fit mb-5">
              {(["dashboard", "summary"] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className="px-6 py-2 rounded-lg text-sm font-semibold transition-all"
                  style={{
                    background: view === v ? BRAND : "transparent",
                    color:      view === v ? "#fff" : "#6b7280",
                  }}
                >
                  {v === "dashboard" ? "Dashboard" : "Summary"}
                </button>
              ))}
            </div>
          )}

          {/* ── Balance Sheet & Cash Flow Section ────────────────────── */}
          {false && (() => {
            const p   = bsPeriods[activePeriod] ?? bsPeriods[0];
            const kpi = periodKpis(p);
            const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
            const fmtS = (n: number) => {
              if (n < 0) return `(${Math.abs(n).toLocaleString("en-US", {minimumFractionDigits:0,maximumFractionDigits:0})})`;
              return n.toLocaleString("en-US", {minimumFractionDigits:0,maximumFractionDigits:0});
            };

            // Bar chart: compare periods for Total Assets, Equity, Liabilities
            const compareMetrics = [
              { label: "Total Assets",    color: BRAND,     getValue: (x: PeriodFile) => periodKpis(x).totalAssets },
              { label: "Total Equity",    color: "#059669", getValue: (x: PeriodFile) => periodKpis(x).totalEquity },
              { label: "Total Liab.",     color: "#DC2626", getValue: (x: PeriodFile) => periodKpis(x).totalLiabilities },
            ];
            const compareMax = Math.max(1, ...bsPeriods.flatMap(px => compareMetrics.map(m => Math.abs(m.getValue(px)))));

            // CF bars
            const cfBars = [
              { label: "Operating",  color: "#059669", val: kpi.operatingCF },
              { label: "Investing",  color: "#DC2626", val: kpi.investingCF },
              { label: "Financing",  color: "#0891B2", val: kpi.financingCF },
            ];
            const cfMax = Math.max(1, ...cfBars.map(b => Math.abs(b.val)));

            return (
              <div className="mb-6 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100"
                  style={{ background: `linear-gradient(90deg,${BRAND},#2a5a9e)` }}>
                  <div>
                    <p className="text-white font-bold text-sm">Balance Sheet & Cash Flow</p>
                    <p className="text-white/60 text-[10px]" dir="rtl">شركة مدينه الأخضر الدولي للتجارة</p>
                  </div>
                  {/* Period tabs */}
                  <div className="flex gap-1 bg-white/10 rounded-lg p-0.5">
                    {bsPeriods.map((px, i) => (
                      <button key={px.period} onClick={() => setActivePeriod(i)}
                        className="px-3 py-1 rounded-md text-[11px] font-semibold transition-all"
                        style={{ background: activePeriod===i ? "#fff" : "transparent", color: activePeriod===i ? BRAND : "rgba(255,255,255,.7)" }}>
                        {px.period}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-5 space-y-5">
                  {/* KPI cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: "Total Assets",    val: kpi.totalAssets,      color: BRAND,     bg: "#EEF2F9" },
                      { label: "Total Equity",    val: kpi.totalEquity,      color: "#059669", bg: "#ECFDF5" },
                      { label: "Net Income",      val: kpi.netIncome,        color: kpi.netIncome >= 0 ? "#059669" : "#DC2626", bg: kpi.netIncome >= 0 ? "#ECFDF5" : "#FEF2F2" },
                      { label: "Cash & Bank",     val: kpi.cash,             color: "#0891B2", bg: "#ECFEFF" },
                    ].map(({ label, val, color, bg }) => (
                      <div key={label} className="rounded-xl p-3 flex flex-col gap-1" style={{ background: bg }}>
                        <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color }}>{label}</p>
                        <p className="text-base font-bold tabular-nums leading-tight" style={{ color }}>
                          SAR {fmt(Math.abs(val))}
                        </p>
                        {val < 0 && <p className="text-[9px]" style={{ color }}>(deficit)</p>}
                      </div>
                    ))}
                  </div>

                  {/* Charts row */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                    {/* Period comparison bar chart */}
                    <div>
                      <p className="text-xs font-bold text-gray-600 mb-1">Period Comparison</p>
                      <p className="text-[10px] text-gray-400 mb-3">Assets · Equity · Liabilities across periods</p>
                      {bsPeriods.length === 1 ? (
                        /* Single period — horizontal bars */
                        <div className="space-y-3">
                          {compareMetrics.map(({ label, color, getValue }) => {
                            const val = getValue(p);
                            const pct = compareMax > 0 ? (Math.abs(val) / compareMax) * 100 : 0;
                            return (
                              <div key={label}>
                                <div className="flex justify-between text-[10px] mb-1">
                                  <span className="text-gray-500">{label}</span>
                                  <span className="font-semibold font-mono tabular-nums" style={{ color }}>
                                    SAR {fmt(Math.abs(val))}
                                  </span>
                                </div>
                                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width:`${pct}%`, background: color }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        /* Two periods — grouped bar chart */
                        (() => {
                          const GW = 44, BW = 16, GAP = 5, CH = 90;
                          const totalW = compareMetrics.length * (GW + 8) + 8;
                          return (
                            <div>
                              <svg viewBox={`0 0 ${totalW} ${CH + 28}`} className="w-full" style={{height:"140px"}}>
                                {[0,0.25,0.5,0.75,1].map(t => (
                                  <line key={t} x1="0" y1={CH-t*CH} x2={totalW} y2={CH-t*CH} stroke="#f3f4f6" strokeWidth="0.5"/>
                                ))}
                                {compareMetrics.map(({ label, color, getValue }, mi) => {
                                  const gx = 4 + mi * (GW + 8);
                                  return (
                                    <g key={label}>
                                      {bsPeriods.map((px, pi) => {
                                        const val = Math.abs(getValue(px));
                                        const h   = compareMax > 0 ? (val / compareMax) * CH : 0;
                                        const bx  = gx + pi * (BW + GAP);
                                        const opacity = pi === 0 ? 1 : 0.5;
                                        return <rect key={pi} x={bx} y={CH-h} width={BW} height={h}
                                          fill={color} opacity={opacity} rx="2"/>;
                                      })}
                                      <text x={gx + GW/2 - GAP} y={CH+12} textAnchor="middle" fontSize="5" fill="#9ca3af" fontFamily="sans-serif">
                                        {label}
                                      </text>
                                    </g>
                                  );
                                })}
                              </svg>
                              {/* period legend */}
                              <div className="flex gap-4 mt-1">
                                {bsPeriods.map((px, pi) => (
                                  <div key={px.period} className="flex items-center gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-sm" style={{ background: "#1B3A6B", opacity: pi===0?1:0.5 }}/>
                                    <span className="text-[9px] text-gray-400">{px.period}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()
                      )}
                    </div>

                    {/* Cash Flow chart */}
                    <div>
                      <p className="text-xs font-bold text-gray-600 mb-1">Cash Flow — {p.period}</p>
                      <p className="text-[10px] text-gray-400 mb-3">Operating · Investing · Financing (SAR)</p>
                      <div className="space-y-3">
                        {cfBars.map(({ label, color, val }) => {
                          const pct = cfMax > 0 ? (Math.abs(val) / cfMax) * 100 : 0;
                          return (
                            <div key={label}>
                              <div className="flex justify-between text-[10px] mb-1">
                                <span className="text-gray-500">{label}</span>
                                <span className="font-semibold font-mono tabular-nums" style={{ color: val < 0 ? "#DC2626" : color }}>
                                  {fmtS(val)}
                                </span>
                              </div>
                              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width:`${pct}%`, background: val < 0 ? "#DC2626" : color }} />
                              </div>
                            </div>
                          );
                        })}
                        {/* Net change callout */}
                        <div className="mt-2 rounded-xl px-3 py-2.5 flex items-center justify-between"
                          style={{ background: kpi.closingCash >= 0 ? "#ECFDF5" : "#FEF2F2" }}>
                          <span className="text-[10px] font-bold text-gray-500">Closing Cash & Bank</span>
                          <span className="text-sm font-bold tabular-nums"
                            style={{ color: kpi.closingCash >= 0 ? "#059669" : "#DC2626" }}>
                            SAR {fmtS(kpi.closingCash)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* BS structure — Assets vs Equity+Liabilities mini table */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Assets side */}
                    <div className="rounded-xl border border-gray-100 overflow-hidden">
                      <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white" style={{ background: BRAND }}>
                        Assets
                      </div>
                      {[
                        { label: "Current Assets",     val: kpi.currentAssets    },
                        { label: "Non-Current Assets", val: kpi.nonCurrentAssets },
                      ].map(({ label, val }) => (
                        <div key={label} className="flex justify-between px-3 py-2 border-b border-gray-50 text-[11px]">
                          <span className="text-gray-500">{label}</span>
                          <span className="font-semibold font-mono tabular-nums" style={{ color: BRAND }}>
                            {fmt(Math.abs(val))}
                          </span>
                        </div>
                      ))}
                      <div className="flex justify-between px-3 py-2 bg-gray-50 text-[11px] font-bold">
                        <span style={{ color: BRAND }}>TOTAL ASSETS</span>
                        <span className="font-mono tabular-nums" style={{ color: BRAND }}>{fmt(Math.abs(kpi.totalAssets))}</span>
                      </div>
                    </div>

                    {/* Equity + Liabilities side */}
                    <div className="rounded-xl border border-gray-100 overflow-hidden">
                      <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white" style={{ background: "#374151" }}>
                        Equity & Liabilities
                      </div>
                      {[
                        { label: "Total Equity",       val: kpi.totalEquity,      color: "#059669" },
                        { label: "Total Liabilities",  val: kpi.totalLiabilities, color: "#DC2626" },
                      ].map(({ label, val, color }) => (
                        <div key={label} className="flex justify-between px-3 py-2 border-b border-gray-50 text-[11px]">
                          <span className="text-gray-500">{label}</span>
                          <span className="font-semibold font-mono tabular-nums" style={{ color }}>
                            {fmt(Math.abs(val))}
                          </span>
                        </div>
                      ))}
                      <div className="flex justify-between px-3 py-2 bg-gray-50 text-[11px] font-bold">
                        <span className="text-gray-700">TOTAL</span>
                        <span className="font-mono tabular-nums text-gray-700">
                          {fmt(Math.abs(kpi.totalEquity + kpi.totalLiabilities))}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Page title */}
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm"
                style={{ background: `linear-gradient(135deg, ${BRAND}, #2a5a9e)` }}>
                <LayoutDashboard size={22} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">Account Dashboard</h1>
                <p className="text-sm text-gray-500">
                  {loading ? "Loading…" : `${selectedIds.length} compan${selectedIds.length === 1 ? "y" : "ies"} selected`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {!loading && selectedIds.length > 1 && (
                <span className="text-[11px] font-bold px-3 py-1.5 rounded-full"
                  style={{ background: `${BRAND}15`, color: BRAND }}>
                  Comparing {selectedIds.length} companies
                </span>
              )}
              {!loading && (
                <button
                  onClick={exportFullReport}
                  className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all hover:shadow-md active:scale-95"
                  style={{ backgroundColor: BRAND, boxShadow: `0 2px 8px ${BRAND}40` }}
                >
                  <Download size={15} /> Export Full Report
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-32">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-[#1B3A6B] border-t-transparent animate-spin" />
                <p className="text-sm text-gray-400">Loading dashboard…</p>
              </div>
            </div>
          ) : selectedIds.length === 0 ? (
            <div className="flex items-center justify-center py-32 text-gray-400 text-sm">No company selected.</div>
          ) : view === "summary" && bsPeriods.length > 0 ? (() => {
            // ── Summary Report ─────────────────────────────────────────────────────
            const validPeriods = bsPeriods.filter(xp => periodKpis(xp).totalAssets > 0);
            const p   = validPeriods[Math.min(activePeriod, validPeriods.length - 1)] ?? bsPeriods[0];

            // Core BS values
            const totalAssets      = bsVal(p, "total assets");
            const currentAssets    = bsVal(p, "total current assets");
            const nonCurrentAssets = bsVal(p, "total non current assets");
            const totalEquity      = bsVal(p, "total equity");
            const totalLiabilities = bsVal(p, "total liabilities", "total liabilities ");
            const currentLiab      = bsFindAny(p, "total current liabilities");
            const nonCurrentLiab   = bsFindAny(p, "total non-current liabilities", "total non current liabilities", "non-current liability");
            const cash             = bsVal(p, "bank balances and cash");
            const retainedEarnings = bsFindAny(p, "retained earnings", "accumulated losses", "accumulated deficit", "retained");
            const tradePayables    = bsFindAny(p, "trade and other payables", "trade payables", "accounts payable");
            const receivables      = bsFindAny(p, "trade receivables", "accounts receivable", "trade and other receivables");

            // Core CF values
            const netIncome   = cfVal(p, "net income before zakat and income tax");
            const operatingCF = cfVal(p, "net cash from operating activities");
            const investingCF = cfVal(p, "net cash from investing activities");
            const financingCF = cfVal(p, "net cash (used in)/from financing activities");
            const closingCash = cfVal(p, "closing cash and bank");
            const netChangeCF = operatingCF + investingCF + financingCF;

            // Ratios
            const debtRatio    = totalAssets > 0 ? (Math.abs(totalLiabilities) / totalAssets) * 100 : 0;
            const currentRatio = currentLiab !== 0 ? Math.abs(currentAssets) / Math.abs(currentLiab) : 0;

            // Overall health colour
            const isProfit    = netIncome > 0;
            const isLiquid    = currentRatio >= 1;
            const healthColor = !isProfit ? "#DC2626" : isLiquid ? "#059669" : "#D97706";
            const healthBg    = !isProfit ? "#FEF2F2" : isLiquid ? "#ECFDF5" : "#FFFBEB";
            const healthLabel = !isProfit
              ? "Loss-Making — Requires Immediate Attention"
              : isLiquid
              ? "Profitable & Liquid — Strong Position"
              : "Profitable but Liquidity-Constrained";

            const pct  = (v: number) => totalAssets > 0 ? ((Math.abs(v) / totalAssets) * 100).toFixed(1) + "%" : "—";
            const fmtV = (n: number) => {
              if (n === 0) return "—";
              if (n < 0) return `(${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })})`;
              return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
            };
            const fmtSAR = (n: number) => {
              if (n === 0) return "SAR —";
              if (n < 0) return `SAR (${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })})`;
              return `SAR ${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
            };

            const SRow = ({ label, value, pctVal, highlight }: { label: string; value: number; pctVal?: string; highlight?: boolean }) => (
              <div className={`flex items-center px-5 py-2.5 border-b border-gray-100 text-[12px] ${highlight ? "font-bold bg-[#EEF2F9]" : "hover:bg-gray-50"}`}>
                <span className="flex-1" style={{ color: highlight ? BRAND : "#374151" }}>{label}</span>
                <span className="w-36 text-right tabular-nums font-mono" style={{ color: value < 0 ? "#DC2626" : highlight ? BRAND : "#111827" }}>
                  {fmtV(value)}
                </span>
                {pctVal !== undefined && (
                  <span className="w-20 text-right text-gray-400 tabular-nums">{pctVal}</span>
                )}
              </div>
            );

            const recActions = [
              "Accelerate receivables collection — prioritise converting accounts receivable to cash.",
              "Negotiate extended payment terms with suppliers to ease payables pressure.",
              "Monitor the current ratio monthly — target above 1.0 to reduce short-term risk.",
              "Avoid taking on new debt obligations until the equity base strengthens further.",
              "Continue the profitable operations trajectory — sustaining net income will rebuild retained earnings over time.",
            ];

            return (
              <div className="space-y-5 pb-10">

                {/* Period selector */}
                {validPeriods.length > 1 && (
                  <div className="flex gap-2">
                    {validPeriods.map((px, i) => (
                      <button key={px.period} onClick={() => setActivePeriod(i)}
                        className="px-4 py-1.5 rounded-full text-sm font-semibold transition-all border"
                        style={{ background: activePeriod === i ? BRAND : "#fff", color: activePeriod === i ? "#fff" : BRAND, borderColor: BRAND }}>
                        {px.period}
                      </button>
                    ))}
                  </div>
                )}

                {/* Report header */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-6 py-5" style={{ background: `linear-gradient(135deg, ${BRAND}, #2a5a9e)` }}>
                    <p className="text-xs font-bold uppercase tracking-widest text-white/50 mb-1">Financial Analysis Report</p>
                    <h2 className="text-xl font-bold text-white"
                      style={{ direction: isAr(coName(bsCompany)) ? "rtl" : "ltr" }}>
                      {coName(bsCompany)}
                    </h2>
                    <div className="flex items-center gap-6 mt-3 text-xs text-white/50">
                      <span>Reporting Period: {p.period}</span>
                      <span>Currency: SAR</span>
                      <span>Generated: {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}</span>
                    </div>
                  </div>
                </div>

                {/* Overall assessment */}
                <div className="rounded-2xl border px-6 py-5" style={{ borderColor: healthColor + "44", background: healthBg }}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: healthColor }} />
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: healthColor }}>Overall Assessment</p>
                  </div>
                  <p className="text-base font-bold mb-2" style={{ color: healthColor }}>{healthLabel}</p>
                  <p className="text-[13px] leading-relaxed text-gray-600">
                    {isProfit
                      ? `As of ${p.period}, the company has recorded a net income of ${fmtSAR(netIncome)}, reflecting a ${retainedEarnings < 0 ? "recovery from prior-period losses" : "continuation of profitable operations"}. Operating cash flow is ${operatingCF > 0 ? "positive at " + fmtSAR(operatingCF) + ", confirming that core operations are genuinely generating cash" : "negative, requiring attention"}. ${!isLiquid ? "However, the current ratio of " + currentRatio.toFixed(3) + " is below 1.0 — short-term obligations exceed current assets, presenting a liquidity risk that requires close management." : "The current ratio of " + currentRatio.toFixed(3) + " indicates the company can meet its short-term obligations."}`
                      : `As of ${p.period}, the company recorded a net loss of ${fmtSAR(Math.abs(netIncome))}. Immediate management attention is required to return operations to profitability and preserve the equity base.`
                    }
                  </p>
                </div>

                {/* 1. Positive Indicators */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2" style={{ background: "#ECFDF5" }}>
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">1. Positive Indicators</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px] min-w-[520px]">
                      <thead>
                        <tr className="text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100 bg-gray-50/60">
                          <th className="px-5 py-2.5 text-left font-semibold">Metric</th>
                          <th className="px-5 py-2.5 text-right font-semibold">Value (SAR)</th>
                          <th className="px-5 py-2.5 text-left font-semibold">Significance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { label: "Net Income (before Zakat)", value: netIncome, note: netIncome > 0 ? "Company made money this period" : "Loss recorded this period" },
                          { label: "Operating Cash Flow", value: operatingCF, note: operatingCF > 0 ? "Core operations generating real cash" : "Operations consuming cash — review urgently" },
                          { label: "Total Equity", value: totalEquity, note: totalEquity > 0 ? "Positive equity — shareholders retain value" : "Negative equity — liabilities exceed assets" },
                        ].map(({ label, value, note }) => (
                          <tr key={label} className="border-b border-gray-50 hover:bg-gray-50/60">
                            <td className="px-5 py-3 font-medium text-gray-700">{label}</td>
                            <td className="px-5 py-3 text-right tabular-nums font-bold font-mono" style={{ color: value >= 0 ? "#059669" : "#DC2626" }}>
                              {value < 0 ? `(${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 0 })})` : value.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                            </td>
                            <td className="px-5 py-3 text-gray-500">{note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 2. Warning Signs */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2" style={{ background: "#FEF2F2" }}>
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-red-700">2. Warning Signs — Financial Stress Indicators</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px] min-w-[540px]">
                      <thead>
                        <tr className="text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100 bg-gray-50/60">
                          <th className="px-5 py-2.5 text-left font-semibold">Issue</th>
                          <th className="px-5 py-2.5 text-right font-semibold">Figure</th>
                          <th className="px-5 py-2.5 text-left font-semibold">What It Means</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          {
                            label: "Retained Earnings",
                            raw: retainedEarnings,
                            display: retainedEarnings !== 0 ? fmtV(retainedEarnings) : "N/A",
                            note: retainedEarnings < 0 ? "Negative — accumulated prior-period losses" : retainedEarnings > 0 ? "Positive — profitable history" : "Not separately disclosed",
                            isWarn: retainedEarnings < 0,
                          },
                          {
                            label: "Debt Ratio",
                            raw: debtRatio,
                            display: debtRatio.toFixed(1) + "%",
                            note: debtRatio > 90 ? "Extreme leverage — almost all assets funded by debt" : debtRatio > 70 ? "High leverage — significant portion funded by debt" : "Moderate leverage",
                            isWarn: debtRatio > 70,
                          },
                          {
                            label: "Cash & Bank Balance",
                            raw: cash,
                            display: fmtV(cash),
                            note: totalAssets > 0 && cash / totalAssets < 0.02 ? `Only ${(cash / totalAssets * 100).toFixed(1)}% of total assets — critically low liquidity buffer` : "Adequate cash reserve",
                            isWarn: totalAssets > 0 && cash / totalAssets < 0.02,
                          },
                          {
                            label: "Trade & Other Payables",
                            raw: tradePayables,
                            display: fmtV(tradePayables),
                            note: tradePayables > 0 && cash > 0 ? `Company owes ${(tradePayables / cash).toFixed(0)}× more to suppliers than available cash` : "Payables disclosed",
                            isWarn: tradePayables > 0 && cash > 0 && tradePayables / cash > 5,
                          },
                          {
                            label: "Current Ratio",
                            raw: currentRatio,
                            display: currentRatio > 0 ? currentRatio.toFixed(3) : "N/A",
                            note: currentRatio > 0 && currentRatio < 1 ? "Below 1.0 — current liabilities exceed current assets; short-term liquidity risk" : currentRatio >= 1 ? "Above 1.0 — company can meet short-term obligations" : "Cannot compute (no current liabilities found)",
                            isWarn: currentRatio > 0 && currentRatio < 1,
                          },
                        ].map(({ label, display, note, isWarn }) => (
                          <tr key={label} className="border-b border-gray-50 hover:bg-gray-50/60">
                            <td className="px-5 py-3 font-medium text-gray-700">{label}</td>
                            <td className="px-5 py-3 text-right tabular-nums font-bold font-mono" style={{ color: isWarn ? "#DC2626" : "#374151" }}>
                              {display}
                            </td>
                            <td className="px-5 py-3 text-gray-500">{note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 3. Key Balance Sheet Figures */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between" style={{ background: BRAND }}>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-white">3. Key Balance Sheet Figures — {p.period}</span>
                    <span className="text-white/60 text-[11px]">SAR</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    <SRow label="Total Assets"             value={totalAssets}      pctVal="100.0%" highlight />
                    <SRow label="↳  Current Assets"        value={currentAssets}    pctVal={pct(currentAssets)} />
                    <SRow label="↳  Non-Current Assets"    value={nonCurrentAssets} pctVal={pct(nonCurrentAssets)} />
                    <SRow label="Total Liabilities"        value={totalLiabilities} pctVal={pct(totalLiabilities)} highlight />
                    <SRow label="↳  Current Liabilities"   value={currentLiab}      pctVal={pct(currentLiab)} />
                    <SRow label="↳  Non-Current Liabilities" value={nonCurrentLiab} pctVal={pct(nonCurrentLiab)} />
                    <SRow label="Total Equity"             value={totalEquity}      pctVal={pct(totalEquity)} highlight />
                  </div>
                </div>

                {/* 4. Cash Flow Summary */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between" style={{ background: "#374151" }}>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-white">4. Cash Flow Summary</span>
                    <span className="text-white/60 text-[11px]">SAR</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {[
                      { label: "Net cash from Operating Activities", value: operatingCF },
                      { label: "Net cash from Investing Activities",  value: investingCF },
                      { label: "Net cash from Financing Activities",  value: financingCF },
                      { label: "Net Change in Cash",                  value: netChangeCF },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center px-5 py-2.5 text-[12px] hover:bg-gray-50">
                        <span className="flex-1 text-gray-500">{label}</span>
                        <span className="w-40 text-right tabular-nums font-mono font-semibold"
                          style={{ color: value < 0 ? "#DC2626" : value > 0 ? "#059669" : "#9ca3af" }}>
                          {value < 0 ? `(${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 0 })})` : value === 0 ? "—" : `+${value.toLocaleString("en-US", { minimumFractionDigits: 0 })}`}
                        </span>
                      </div>
                    ))}
                    <div className="flex items-center px-5 py-3 text-[12px] font-bold" style={{ background: "#f0fdf4", borderTop: "2px solid #059669" }}>
                      <span className="flex-1 text-emerald-700">Closing Cash &amp; Bank</span>
                      <span className="w-40 text-right tabular-nums font-mono text-emerald-700">
                        {closingCash.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 5. Conclusion & Recommendations */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100" style={{ background: "#F5F3FF" }}>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700">5. Conclusion &amp; Recommendations</span>
                  </div>
                  <div className="px-6 py-5 space-y-4">
                    <div>
                      <p className="text-sm font-bold text-gray-800 mb-1">
                        Verdict:{" "}
                        <span style={{ color: healthColor }}>{healthLabel}</span>
                      </p>
                      <p className="text-[13px] leading-relaxed text-gray-600">
                        {isProfit
                          ? `The company ${retainedEarnings < 0 ? "turned profitable after prior-year losses (evidenced by negative retained earnings of " + fmtSAR(retainedEarnings) + ")" : "continues its profitable trajectory"}. It is ${currentRatio < 1 ? "investing in growth while generating solid operating cash flows, but short-term liquidity remains constrained." : "generating healthy operating cash flows and maintaining adequate short-term liquidity."} ${investingCF < 0 ? "Investing outflows of " + fmtSAR(Math.abs(investingCF)) + " indicate active capital investment in the business." : ""}`
                          : `The company reported a net loss of ${fmtSAR(Math.abs(netIncome))} this period. ${operatingCF > 0 ? "Operating cash flow remains positive, suggesting the loss may be driven by non-cash or one-time items." : "Operating cash flow is also negative, indicating core business challenges that must be addressed urgently."}`
                        }
                        {tradePayables > 0 && receivables > 0 && ` The primary concern is cash liquidity — with SAR ${tradePayables.toLocaleString("en-US", { maximumFractionDigits: 0 })} in trade payables against only SAR ${cash.toLocaleString("en-US", { maximumFractionDigits: 0 })} in cash, the company depends on converting its receivables (SAR ${receivables.toLocaleString("en-US", { maximumFractionDigits: 0 })}) to cash promptly.`}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Recommended Actions</p>
                      <ol className="space-y-2">
                        {recActions.map((action, i) => (
                          <li key={i} className="flex items-start gap-3 text-[13px] text-gray-600">
                            <span className="flex-shrink-0 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white mt-0.5"
                              style={{ background: BRAND }}>{i + 1}</span>
                            {action}
                          </li>
                        ))}
                      </ol>
                    </div>
                    <p className="text-[10px] text-gray-400 pt-3 border-t border-gray-100">
                      This report is generated automatically from uploaded financial data (Balance Sheet &amp; Cash Flow Statement, {p.period}). · Namma Dashboard
                    </p>
                  </div>
                </div>
              </div>
            );
          })() : bsPeriods.length > 0 ? (() => {
              const validPeriods = bsPeriods.filter(xp => periodKpis(xp).totalAssets > 0);
              const p   = validPeriods[Math.min(activePeriod, validPeriods.length - 1)] ?? bsPeriods[0];
              const kpi = periodKpis(p);
              const fmtN = (n: number) => Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              const fmtNeg = (n: number) => n < 0
                ? `(${Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})})`
                : n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});

              // Asset donut
              const PIE_R2 = 65; const PIE_C2 = 2 * Math.PI * PIE_R2;
              const assetSegs = [
                { label: "Current Assets",     val: kpi.currentAssets,    color: BRAND    },
                { label: "Non-Current Assets", val: kpi.nonCurrentAssets, color: "#2a5a9e" },
              ];
              const assetTotal = Math.max(1, Math.abs(kpi.totalAssets));
              let acc2 = 0;
              const assetPie = assetSegs.map(s => {
                const len = (Math.abs(s.val) / assetTotal) * PIE_C2;
                const off = PIE_C2 * 0.25 - acc2;
                acc2 += len;
                return { ...s, len, off };
              });

              // CF bars
              const cfBars2 = [
                { label: "Operating Activities", val: kpi.operatingCF, color: "#059669" },
                { label: "Investing Activities", val: kpi.investingCF, color: "#DC2626" },
                { label: "Financing Activities", val: kpi.financingCF, color: "#0891B2" },
              ];
              const cfMax2 = Math.max(1, ...cfBars2.map(b => Math.abs(b.val)));

              // Equity vs Liabilities donut
              const eqLiabTotal = Math.max(1, Math.abs(kpi.totalEquity) + Math.abs(kpi.totalLiabilities));
              let acc3 = 0;
              const eqLiabPie = [
                { label: "Equity",      val: kpi.totalEquity,      color: "#059669" },
                { label: "Liabilities", val: kpi.totalLiabilities, color: "#DC2626" },
              ].map(s => {
                const len = (Math.abs(s.val) / eqLiabTotal) * PIE_C2;
                const off = PIE_C2 * 0.25 - acc3;
                acc3 += len;
                return { ...s, len, off };
              });

              return (
                <>
                  {/* Period selector */}
                  {validPeriods.length > 1 && (
                    <div className="flex gap-2 mb-5">
                      {validPeriods.map((px, i) => (
                        <button key={px.period} onClick={() => setActivePeriod(i)}
                          className="px-4 py-1.5 rounded-full text-sm font-semibold transition-all border"
                          style={{
                            background: activePeriod===i ? BRAND : "#fff",
                            color: activePeriod===i ? "#fff" : BRAND,
                            borderColor: BRAND,
                          }}>
                          {px.period}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* ── KPI Cards ──────────────────────────────────────────── */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
                    {[
                      { label: "Total Assets",       sub: "Period: " + p.period, val: kpi.totalAssets,      color: BRAND,     bg: "#EEF2F9",  Icon: TrendingUp   },
                      { label: "Shareholders Equity",sub: "Owner funds",           val: kpi.totalEquity,      color: "#059669", bg: "#ECFDF5",  Icon: Wallet       },
                      { label: "Total Liabilities",  sub: "Obligations",           val: kpi.totalLiabilities, color: "#DC2626", bg: "#FEF2F2",  Icon: TrendingDown },
                      { label: "Cash & Bank",        sub: "Closing balance",       val: kpi.cash,             color: "#0891B2", bg: "#ECFEFF",  Icon: CreditCard   },
                    ].map(({ label, sub, val, color, bg, Icon }) => (
                      <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: bg, color }}>
                            <Icon size={18} />
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color }}>{label}</span>
                        </div>
                        <p className="text-[11px] text-gray-400 mb-0.5">{sub}</p>
                        <p className="text-xl font-bold tabular-nums text-gray-800">SAR {fmtN(val)}</p>
                      </div>
                    ))}
                  </div>

                  {/* ── Financial Position Banner ──────────────────────────── */}
                  <div className="rounded-2xl px-6 py-4 mb-5 flex items-center justify-between"
                    style={{ backgroundColor: BRAND }}>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-white/60 mb-0.5">Financial Position</p>
                      <p className="text-[10px] text-white/40">Balance Sheet · {p.period}</p>
                      <p className="text-[10px] text-white/40 mt-0.5"
                        style={{ direction: isAr(coName(bsCompany)) ? "rtl" : "ltr" }}>
                        {coName(bsCompany)}
                      </p>
                    </div>
                    <div className="flex items-center gap-6 text-right">
                      <div>
                        <p className="text-[10px] text-white/50 uppercase tracking-wider mb-0.5">Net Income</p>
                        <p className={`text-xl font-bold tabular-nums ${kpi.netIncome >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          SAR {fmtNeg(kpi.netIncome)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-white/50 uppercase tracking-wider mb-0.5">Net Cash Flow</p>
                        <p className={`text-xl font-bold tabular-nums ${kpi.closingCash >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          SAR {fmtNeg(kpi.closingCash)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* ── Charts ─────────────────────────────────────────────── */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">

                    {/* Asset Composition Donut */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                      <h3 className="text-sm font-bold text-gray-700 mb-0.5">Asset Composition</h3>
                      <p className="text-[11px] text-gray-400 mb-4">Current vs Non-Current</p>
                      <div className="flex items-center gap-4">
                        <svg viewBox="0 0 160 160" className="w-28 h-28 flex-shrink-0">
                          {assetPie.map((s, i) => s.len > 0.5 ? (
                            <circle key={i} cx="80" cy="80" r={PIE_R2} fill="none"
                              stroke={s.color} strokeWidth="24"
                              strokeDasharray={`${s.len} ${PIE_C2}`}
                              strokeDashoffset={s.off} strokeLinecap="butt" />
                          ) : null)}
                          <text x="80" y="76" textAnchor="middle" fontSize="7" fill="#9ca3af" fontFamily="sans-serif">ASSETS</text>
                          <text x="80" y="91" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#1f2937" fontFamily="sans-serif">
                            {(kpi.totalAssets/1e6).toFixed(2)}M
                          </text>
                        </svg>
                        <div className="flex-1 space-y-2">
                          {assetSegs.map((s, i) => {
                            const pct = assetTotal > 0 ? (Math.abs(s.val) / assetTotal * 100) : 0;
                            return (
                              <div key={i}>
                                <div className="flex justify-between text-[10px] mb-0.5">
                                  <span className="text-gray-500">{s.label}</span>
                                  <span style={{ color: s.color }} className="font-semibold">{pct.toFixed(1)}%</span>
                                </div>
                                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width:`${pct}%`, background: s.color }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Equity vs Liabilities Donut */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                      <h3 className="text-sm font-bold text-gray-700 mb-0.5">Funding Structure</h3>
                      <p className="text-[11px] text-gray-400 mb-4">Equity vs Liabilities</p>
                      <div className="flex items-center gap-4">
                        <svg viewBox="0 0 160 160" className="w-28 h-28 flex-shrink-0">
                          {eqLiabPie.map((s, i) => s.len > 0.5 ? (
                            <circle key={i} cx="80" cy="80" r={PIE_R2} fill="none"
                              stroke={s.color} strokeWidth="24"
                              strokeDasharray={`${s.len} ${PIE_C2}`}
                              strokeDashoffset={s.off} strokeLinecap="butt" />
                          ) : null)}
                          <text x="80" y="76" textAnchor="middle" fontSize="7" fill="#9ca3af" fontFamily="sans-serif">FUNDING</text>
                          <text x="80" y="91" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#1f2937" fontFamily="sans-serif">
                            {(kpi.totalAssets/1e6).toFixed(2)}M
                          </text>
                        </svg>
                        <div className="flex-1 space-y-2">
                          {[
                            { label: "Equity",      val: kpi.totalEquity,      color: "#059669" },
                            { label: "Liabilities", val: kpi.totalLiabilities, color: "#DC2626" },
                          ].map(s => {
                            const pct = eqLiabTotal > 0 ? (Math.abs(s.val) / eqLiabTotal * 100) : 0;
                            return (
                              <div key={s.label}>
                                <div className="flex justify-between text-[10px] mb-0.5">
                                  <span className="text-gray-500">{s.label}</span>
                                  <span style={{ color: s.color }} className="font-semibold">{pct.toFixed(1)}%</span>
                                </div>
                                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width:`${pct}%`, background: s.color }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Cash Flow Summary */}
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                      <h3 className="text-sm font-bold text-gray-700 mb-0.5">Cash Flow Summary</h3>
                      <p className="text-[11px] text-gray-400 mb-4">SAR — {p.period}</p>
                      <div className="space-y-3">
                        {cfBars2.map(({ label, val, color }) => {
                          const pct = cfMax2 > 0 ? (Math.abs(val) / cfMax2 * 100) : 0;
                          return (
                            <div key={label}>
                              <div className="flex justify-between text-[10px] mb-1">
                                <span className="text-gray-500 truncate pr-2">{label}</span>
                                <span className="font-semibold font-mono tabular-nums shrink-0"
                                  style={{ color: val < 0 ? "#DC2626" : val === 0 ? "#9ca3af" : color }}>
                                  {fmtNeg(val)}
                                </span>
                              </div>
                              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all"
                                  style={{ width:`${pct}%`, background: val < 0 ? "#DC2626" : val === 0 ? "#e5e7eb" : color }} />
                              </div>
                            </div>
                          );
                        })}
                        <div className="mt-2 rounded-xl px-3 py-2.5 flex items-center justify-between border"
                          style={{ borderColor: "#059669", background: "#f0fdf4" }}>
                          <span className="text-[10px] font-bold text-gray-600">Closing Cash & Bank</span>
                          <span className="text-sm font-bold tabular-nums" style={{ color: "#059669" }}>
                            SAR {fmtN(kpi.closingCash)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── Balance Sheet Table ─────────────────────────────────── */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-5">
                    <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between"
                      style={{ background: `linear-gradient(90deg,${BRAND},#2a5a9e)` }}>
                      <h3 className="text-sm font-bold text-white">Balance Sheet</h3>
                      <span className="text-white/70 text-[11px]">{p.period}</span>
                    </div>
                    <div className="overflow-x-auto">
                      {p.bs.map((row, i) => {
                        if (row.type === "section") {
                          return (
                            <div key={i} className="px-5 py-1.5 text-[10px] font-bold uppercase tracking-widest"
                              style={{ color: BRAND, background: "#EEF2F9" }}>
                              {row.label}
                            </div>
                          );
                        }
                        const isDouble = row.label.toUpperCase().startsWith("TOTAL ASSETS") || row.label.toUpperCase().startsWith("TOTAL EQUITY AND");
                        if (row.type === "total") {
                          return (
                            <div key={i} className="flex items-center px-5 py-2.5 text-[12px]"
                              style={{
                                background: isDouble ? "#EEF2F9" : "#f9fafb",
                                borderTop: "1px solid #e5e7eb",
                                borderBottom: isDouble ? `2px double ${BRAND}` : "1px solid #e5e7eb",
                              }}>
                              <span className="flex-1 font-bold" style={{ color: isDouble ? BRAND : "#374151" }}>{row.label}</span>
                              <span className="font-bold font-mono tabular-nums"
                                style={{ color: (row.value ?? 0) < 0 ? "#ef4444" : isDouble ? BRAND : "#111827" }}>
                                {row.value !== null ? fmtNeg(row.value) : "—"}
                              </span>
                            </div>
                          );
                        }
                        return (
                          <div key={i} className="flex items-center px-5 py-2 border-b border-gray-50 text-[12px]">
                            <span className="flex-1 text-gray-500 pl-3">{row.label}</span>
                            <span className="font-mono tabular-nums"
                              style={{ color: (row.value ?? 0) < 0 ? "#ef4444" : (row.value ?? 0) === 0 ? "#d1d5db" : "#374151" }}>
                              {row.value !== null ? fmtNeg(row.value) : "—"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── Cash Flow Table ─────────────────────────────────────── */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-5">
                    <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between"
                      style={{ background: "linear-gradient(90deg,#374151,#4b5563)" }}>
                      <h3 className="text-sm font-bold text-white">Cash Flow Statement</h3>
                      <span className="text-white/70 text-[11px]">{p.period}</span>
                    </div>
                    <div>
                      {p.cf.map((row, i) => {
                        if (row.type === "section") {
                          return (
                            <div key={i} className="px-5 py-1.5 text-[10px] font-bold uppercase tracking-widest"
                              style={{ color: "#374151", background: "#f3f4f6" }}>
                              {row.label}
                            </div>
                          );
                        }
                        const isClosing = row.label.toLowerCase().includes("closing cash");
                        if (row.type === "total") {
                          return (
                            <div key={i} className="flex items-center px-5 py-2.5 text-[12px]"
                              style={{
                                background: isClosing ? "#f0fdf4" : "#f9fafb",
                                borderTop: "1px solid #e5e7eb",
                                borderBottom: isClosing ? "2px double #059669" : "1px solid #e5e7eb",
                              }}>
                              <span className="flex-1 font-bold" style={{ color: isClosing ? "#059669" : "#374151" }}>{row.label}</span>
                              <span className="font-bold font-mono tabular-nums"
                                style={{ color: (row.value ?? 0) < 0 ? "#ef4444" : isClosing ? "#059669" : "#111827" }}>
                                {row.value !== null ? fmtNeg(row.value) : "—"}
                              </span>
                            </div>
                          );
                        }
                        return (
                          <div key={i} className="flex items-center px-5 py-2 border-b border-gray-50 text-[12px]">
                            <span className="flex-1 text-gray-500 pl-3">{row.label}</span>
                            <span className="font-mono tabular-nums"
                              style={{ color: (row.value ?? 0) < 0 ? "#ef4444" : (row.value ?? 0) === 0 ? "#d1d5db" : "#374151" }}>
                              {row.value !== null ? fmtNeg(row.value) : "—"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              );
            })() : (
            <>
              {/* ── Combined KPI cards ───────────────────────────────────── */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                {METRICS.map(({ key, label, color, bg, Icon, href }) => (
                  <Link key={key} href={href}
                    className="group bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md hover:border-[#1B3A6B]/20 transition-all">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg group-hover:scale-105 transition-transform"
                        style={{ backgroundColor: bg, color }}>
                        <Icon size={18} />
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color }}>{label}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mb-0.5">{!isSingle ? "Combined " : ""}{label}</p>
                    <p className="text-xl font-bold text-gray-800 tabular-nums">SAR {money(totals[key as MetricKey])}</p>
                    {!isSingle && (
                      <p className="text-[10px] text-gray-300 mt-1">{selectedIds.length} companies</p>
                    )}
                  </Link>
                ))}
              </div>

              {/* ── Net Balance Banner ─────────────────────────────────────── */}
              <div className="rounded-2xl px-6 py-4 mb-5 flex items-center justify-between"
                style={{ backgroundColor: BRAND }}>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-white/60 mb-0.5">
                    {isSingle ? "Net Balance" : "Combined Net Balance"}
                  </p>
                  <p className="text-[10px] text-white/40">(Income + Receivables) − (Payables + Expenses)</p>
                </div>
                <div className="flex items-center gap-2">
                  {netBalance >= 0 ? <ArrowUpRight size={22} className="text-emerald-400" /> : <ArrowDownRight size={22} className="text-red-400" />}
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wider text-white/50 mb-0.5">{netBalance >= 0 ? "Surplus" : "Deficit"}</p>
                    <p className={`text-2xl font-bold tabular-nums ${netBalance >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      SAR {money(Math.abs(netBalance))}
                    </p>
                  </div>
                </div>
              </div>

              {/* ── Multi-company comparison cards ────────────────────────── */}
              {!isSingle && (
                <div className={`grid gap-4 mb-5 ${
                  selectedIds.length === 2 ? "grid-cols-1 md:grid-cols-2" :
                  selectedIds.length <= 4 ? "grid-cols-1 md:grid-cols-2" :
                  "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                }`}>
                  {selectedIds.map(id => {
                    const d = data[id];
                    if (!d) return null;
                    const net   = (d.income + d.receivables) - (d.payables + d.expenses);
                    const total = d.income + d.payables + d.receivables + d.expenses;
                    const name  = coName(id);
                    return (
                      <div key={id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                        {/* Company name */}
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Company</p>
                        <p className="text-[13px] font-bold text-gray-800 mb-4 leading-snug"
                          style={{ direction: isAr(name) ? "rtl" : "ltr" }}>
                          {name}
                        </p>
                        {/* 4 metric rows */}
                        <div className="flex flex-col gap-2 mb-4">
                          {METRICS.map(({ key, label, color, bg, Icon }) => {
                            const val = d[key as MetricKey];
                            const pct = total > 0 ? (val / total) * 100 : 0;
                            return (
                              <div key={key} className="flex items-center gap-2">
                                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md"
                                  style={{ backgroundColor: bg, color }}>
                                  <Icon size={12} />
                                </div>
                                <span className="text-[11px] text-gray-500 w-20 flex-shrink-0">{label}</span>
                                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                                </div>
                                <span className="text-[11px] font-semibold tabular-nums text-gray-700 w-24 text-right flex-shrink-0">
                                  SAR {money(val)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        {/* Net balance */}
                        <div className="rounded-xl px-3 py-2 flex items-center justify-between"
                          style={{ background: net >= 0 ? "#ECFDF5" : "#FEF2F2" }}>
                          <span className="text-[11px] font-bold" style={{ color: net >= 0 ? "#059669" : "#DC2626" }}>
                            Net Balance
                          </span>
                          <span className="text-[12px] font-bold tabular-nums" style={{ color: net >= 0 ? "#059669" : "#DC2626" }}>
                            {net >= 0 ? "+" : "−"} SAR {money(Math.abs(net))}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Charts row ────────────────────────────────────────────── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">

                {/* Pie / Donut */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                  <h3 className="text-sm font-bold text-gray-700 mb-0.5">
                    {isSingle ? "Distribution" : "Combined Distribution"}
                  </h3>
                  <p className="text-[11px] text-gray-400 mb-5">Share of each account category</p>
                  <div className="flex items-center gap-6">
                    <svg viewBox="0 0 200 200" className="w-44 h-44 flex-shrink-0">
                      {grandTotal === 0 ? (
                        <circle cx="100" cy="100" r={PIE_R} fill="none" stroke="#e5e7eb" strokeWidth="26" />
                      ) : (
                        pieSegs.map((s, i) =>
                          s.len > 0.1 ? (
                            <circle key={i} cx="100" cy="100" r={PIE_R} fill="none"
                              stroke={s.color} strokeWidth="26"
                              strokeDasharray={`${s.len} ${PIE_C}`}
                              strokeDashoffset={s.offset} strokeLinecap="butt" />
                          ) : null
                        )
                      )}
                      <text x="100" y="94" textAnchor="middle" fontSize="8" fill="#9ca3af" fontFamily="sans-serif">TOTAL SAR</text>
                      <text x="100" y="113" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#1f2937" fontFamily="sans-serif">
                        {money(grandTotal)}
                      </text>
                    </svg>
                    <div className="flex-1 flex flex-col gap-3">
                      {METRICS.map(({ key, label, color }, i) => {
                        const pct = grandTotal > 0 ? (pieVals[i] / grandTotal) * 100 : 0;
                        return (
                          <div key={key}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                                <span className="text-[11px] text-gray-500">{label}</span>
                              </div>
                              <span className="text-[11px] font-semibold tabular-nums" style={{ color }}>{pct.toFixed(1)}%</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Monthly bar chart */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                  <h3 className="text-sm font-bold text-gray-700 mb-0.5">Monthly Breakdown</h3>
                  <p className="text-[11px] text-gray-400 mb-4">Stacked totals by month (last 6)</p>
                  {chartMonths.length === 0 ? (
                    <div className="h-36 flex items-center justify-center">
                      <p className="text-xs text-gray-300 text-center">No entries yet — save data from the account forms</p>
                    </div>
                  ) : (() => {
                    const COL = 36, BAR_W = 22, CH = 90;
                    const viewW = chartMonths.length * COL + 8;
                    return (
                      <>
                        <svg viewBox={`0 0 ${viewW} ${CH + 22}`} className="w-full" style={{ height: "148px" }}>
                          {[0, 0.25, 0.5, 0.75, 1].map(t => (
                            <line key={t} x1="0" y1={CH - t * CH} x2={viewW} y2={CH - t * CH}
                              stroke="#f3f4f6" strokeWidth="0.5" />
                          ))}
                          {chartMonths.map((month, mi) => {
                            const vals = monthlyMap[month];
                            const barX = mi * COL + (COL - BAR_W) / 2;
                            let curY = CH;
                            return (
                              <g key={month}>
                                {METRICS.map(({ color }, ci) => {
                                  const segH = maxBarVal > 0 ? (vals[ci] / maxBarVal) * CH : 0;
                                  if (segH < 0.5) return null;
                                  curY -= segH;
                                  const rectY = curY;
                                  return <rect key={ci} x={barX} y={rectY} width={BAR_W} height={segH} fill={color} rx="2" />;
                                })}
                                <text x={barX + BAR_W / 2} y={CH + 13} textAnchor="middle"
                                  fontSize="5.5" fill="#9ca3af" fontFamily="sans-serif">
                                  {month.split(" ")[0].slice(0, 3)} {month.split(" ")[1]?.slice(-2)}
                                </text>
                              </g>
                            );
                          })}
                        </svg>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 pt-3 border-t border-gray-100">
                          {METRICS.map(({ key, label, color }) => (
                            <div key={key} className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />
                              <span className="text-[10px] text-gray-400">{label}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* ── Company comparison table (multi only) ─────────────────── */}
              {!isSingle && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-5">
                  <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Company Comparison</h3>
                    <span className="text-xs text-gray-400">{selectedIds.length} companies</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[700px]">
                      <thead>
                        <tr style={{ backgroundColor: BRAND }} className="text-white text-xs uppercase tracking-wide">
                          <th className="px-5 py-3 text-left">Company</th>
                          {METRICS.map(({ label, color }) => (
                            <th key={label} className="px-4 py-3 text-right" style={{ color: "#e0f2fe" }}>{label}</th>
                          ))}
                          <th className="px-5 py-3 text-right">Net Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedIds.map((id, idx) => {
                          const d    = data[id];
                          const net  = d ? (d.income + d.receivables) - (d.payables + d.expenses) : 0;
                          const name = coName(id);
                          return (
                            <tr key={id} className={`border-b border-gray-100 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}`}>
                              <td className="px-5 py-3">
                                <span className="text-[12px] font-medium text-gray-700 leading-snug block max-w-[200px]"
                                  style={{ direction: isAr(name) ? "rtl" : "ltr" }}>
                                  {name}
                                </span>
                              </td>
                              {METRICS.map(({ key, color }) => (
                                <td key={key} className="px-4 py-3 text-right tabular-nums text-[12px] font-semibold" style={{ color }}>
                                  {d ? money(d[key as MetricKey]) : "—"}
                                </td>
                              ))}
                              <td className="px-5 py-3 text-right tabular-nums text-[12px] font-bold"
                                style={{ color: net >= 0 ? "#059669" : "#DC2626" }}>
                                {net >= 0 ? "+" : "−"} SAR {money(Math.abs(net))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-gray-200 bg-gray-50/80">
                          <td className="px-5 py-3 font-bold text-gray-700 text-[12px]">Total ({selectedIds.length})</td>
                          {METRICS.map(({ key, color }) => (
                            <td key={key} className="px-4 py-3 text-right tabular-nums font-bold text-[12px]" style={{ color }}>
                              {money(totals[key as MetricKey])}
                            </td>
                          ))}
                          <td className="px-5 py-3 text-right tabular-nums font-bold text-[13px]"
                            style={{ color: netBalance >= 0 ? "#059669" : "#DC2626" }}>
                            {netBalance >= 0 ? "+" : "−"} SAR {money(Math.abs(netBalance))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Single company full tally table ───────────────────────── */}
              {isSingle && ((): React.ReactNode => {
                const id   = selectedIds[0];
                const d    = data[id];
                const vals = [d?.income ?? 0, d?.payables ?? 0, d?.receivables ?? 0, d?.expenses ?? 0];
                const gt   = vals.reduce((s, v) => s + v, 0);
                const net  = (vals[0] + vals[2]) - (vals[1] + vals[3]);
                const totalRows = METRICS.reduce((s, { key }) => s + (d?.rows[key as MetricKey]?.length ?? 0), 0);

                // Group income rows by bank name
                const bankMap: Record<string, number> = {};
                (d?.rows.income ?? []).forEach(row => {
                  const bank = (row.bankName as string) || "Unknown";
                  bankMap[bank] = (bankMap[bank] ?? 0) + num(row.amount);
                });
                const bankEntries = Object.entries(bankMap).sort((a, b) => b[1] - a[1]);

                return (
                  <>
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-5">
                      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Full Tally</h3>
                        <span className="text-xs text-gray-400">{totalRows} total entr{totalRows === 1 ? "y" : "ies"}</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[540px]">
                          <thead>
                            <tr style={{ backgroundColor: BRAND }} className="text-white text-xs uppercase tracking-wide">
                              <th className="px-5 py-3 text-left">Category</th>
                              <th className="px-4 py-3 text-center">Entries</th>
                              <th className="px-4 py-3 text-right">Total (SAR)</th>
                              <th className="px-4 py-3 text-right">Share</th>
                              <th className="px-5 py-3 text-left">Distribution</th>
                            </tr>
                          </thead>
                          <tbody>
                            {METRICS.map(({ key, label, color, bg, Icon }, i) => {
                              const pct = gt > 0 ? (vals[i] / gt) * 100 : 0;
                              return (
                                <tr key={key} className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/40"}`}>
                                  <td className="px-5 py-3.5">
                                    <div className="flex items-center gap-2">
                                      <div className="flex h-7 w-7 items-center justify-center rounded-lg flex-shrink-0"
                                        style={{ backgroundColor: bg, color }}>
                                        <Icon size={14} />
                                      </div>
                                      <span className="font-medium text-gray-700">{label}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3.5 text-center text-gray-500">{d?.rows[key as MetricKey]?.length ?? 0}</td>
                                  <td className="px-4 py-3.5 text-right font-bold tabular-nums" style={{ color }}>{money(vals[i])}</td>
                                  <td className="px-4 py-3.5 text-right text-gray-500 tabular-nums text-xs">{pct.toFixed(1)}%</td>
                                  <td className="px-5 py-3.5">
                                    <div className="w-28 h-2 bg-gray-100 rounded-full overflow-hidden">
                                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-gray-200 bg-gray-50/80">
                              <td className="px-5 py-3.5 font-bold text-gray-700">Net Balance</td>
                              <td className="px-4 py-3.5 text-center text-gray-400 text-xs">{totalRows} total</td>
                              <td className="px-4 py-3.5 text-right font-bold tabular-nums text-base"
                                style={{ color: net >= 0 ? "#059669" : "#DC2626" }}>
                                {net >= 0 ? "+" : "−"} SAR {money(Math.abs(net))}
                              </td>
                              <td className="px-4 py-3.5 text-right text-gray-400 text-xs">100%</td>
                              <td className="px-5 py-3.5" />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>

                    {/* ── Income by Bank breakdown ─────────────────────────── */}
                    {bankEntries.length > 0 && (
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-10">
                        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Income by Bank</h3>
                          <span className="text-xs text-gray-400">{bankEntries.length} bank{bankEntries.length === 1 ? "" : "s"}</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm min-w-[400px]">
                            <thead>
                              <tr style={{ backgroundColor: BRAND }} className="text-white text-xs uppercase tracking-wide">
                                <th className="px-5 py-3 text-center w-10">#</th>
                                <th className="px-5 py-3 text-left">Bank Name</th>
                                <th className="px-4 py-3 text-right">Total (SAR)</th>
                                <th className="px-4 py-3 text-right">Share</th>
                                <th className="px-5 py-3 text-left">Distribution</th>
                              </tr>
                            </thead>
                            <tbody>
                              {bankEntries.map(([bank, total], i) => {
                                const pct = vals[0] > 0 ? (total / vals[0]) * 100 : 0;
                                return (
                                  <tr key={bank} className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/40"}`}>
                                    <td className="px-5 py-3.5 text-center text-xs font-semibold text-gray-400">{i + 1}</td>
                                    <td className="px-5 py-3.5 font-medium text-gray-700">{bank}</td>
                                    <td className="px-4 py-3.5 text-right font-bold tabular-nums" style={{ color: "#059669" }}>
                                      {money(total)}
                                    </td>
                                    <td className="px-4 py-3.5 text-right text-gray-500 tabular-nums text-xs">{pct.toFixed(1)}%</td>
                                    <td className="px-5 py-3.5">
                                      <div className="w-28 h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full transition-all duration-700"
                                          style={{ width: `${pct}%`, backgroundColor: "#059669" }} />
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="border-t-2 border-gray-200 bg-gray-50/80">
                                <td className="px-5 py-3.5" />
                                <td className="px-5 py-3.5 font-bold text-gray-700">Total Income</td>
                                <td className="px-4 py-3.5 text-right font-bold tabular-nums text-base" style={{ color: "#059669" }}>
                                  {money(vals[0])}
                                </td>
                                <td className="px-4 py-3.5 text-right text-gray-400 text-xs">100%</td>
                                <td className="px-5 py-3.5" />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
