"use client";

import { useEffect, useMemo, useState } from "react";
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
      setLoading(false);
    }

    load();

    // Re-fetch whenever the user changes company selection
    window.addEventListener("companiesChanged", load);
    return () => window.removeEventListener("companiesChanged", load);
  }, []);

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
            <span className="text-gray-600 font-medium">Account Dashboard</span>
          </nav>

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
          ) : (
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
              {isSingle && (() => {
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
