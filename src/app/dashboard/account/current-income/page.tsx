"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LogOut,
  ChevronRight,
  TrendingUp,
  Plus,
  Trash2,
  Save,
  History,
  Download,
  CheckCircle2,
  Building2,
  Calendar,
  Banknote,
} from "lucide-react";
import CompanySelector, { COMPANIES } from "@/components/company-selector";
import * as XLSX from "xlsx-js-style";
import { applyStyles } from "@/lib/excel-styles";

const BRAND = "#1B3A6B";

const MONTHS: string[] = (() => {
  const list: string[] = [];
  const now = new Date();
  const start = new Date(now.getFullYear() - 2, now.getMonth());
  const end   = new Date(now.getFullYear() + 2, now.getMonth());
  const cur   = new Date(start);
  while (cur <= end) {
    list.push(cur.toLocaleDateString("en-GB", { month: "long", year: "numeric" }));
    cur.setMonth(cur.getMonth() + 1);
  }
  return list;
})();

const CURRENT_MONTH = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });

const SAUDI_BANKS = [
  "Al Rajhi Bank",
  "SAUDI NATIONAL BANK",
  "National Commercial Bank",
  "The Saudi British Bank",
  "Arab National Bank",
  "Alinma Bank",
  "Bank Albilad",
  "SAB BANK",
];

interface BankRow {
  id: number;
  bankName: string;
  month: string;
  amount: string;
}

interface HistoryEntry {
  id: string;
  companyId: string;
  companyName: string;
  savedAt: string;
  rows: BankRow[];
  total: number;
}

let nextId = 1;
const makeRow = (): BankRow => ({ id: nextId++, bankName: "", month: CURRENT_MONTH, amount: "" });

const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const coName = (id: string) => COMPANIES.find(c => c.id === id)?.name ?? id;

const HIST_KEY = "account_income_history";

export default function CurrentIncomePage() {
  const router = useRouter();
  const [rows, setRows]           = useState<BankRow[]>([makeRow(), makeRow()]);
  const [error, setError]         = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [histData, setHistData]   = useState<HistoryEntry[]>([]);
  const [histOpen, setHistOpen]   = useState(true);

  const total = useMemo(() => rows.reduce((sum, r) => sum + num(r.amount), 0), [rows]);

  useEffect(() => {
    loadHistory();
  }, []);

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HIST_KEY);
      setHistData(raw ? JSON.parse(raw) : []);
    } catch { setHistData([]); }
  }

  function updateRow(id: number, field: keyof Omit<BankRow, "id">, value: string) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
    setError("");
  }

  function addRow() { setRows(prev => [...prev, makeRow()]); }

  function removeRow(id: number) {
    if (rows.length === 1) return;
    setRows(prev => prev.filter(r => r.id !== id));
  }

  function handleSubmit() {
    const filled = rows.filter(r => r.bankName.trim() || num(r.amount) > 0);
    if (filled.length === 0) { setError("Please add at least one bank entry."); return; }
    const incomplete = filled.find(r => !r.bankName.trim() || num(r.amount) <= 0);
    if (incomplete) { setError("Each row needs a Bank Name and an Amount greater than 0."); return; }

    const companyId   = localStorage.getItem("active_company") ?? "diamond-star";
    const companyName = coName(companyId);

    // Update current data (for dashboard)
    const existing = JSON.parse(localStorage.getItem("account_income") ?? "{}");
    existing[companyId] = { rows: filled, total };
    localStorage.setItem("account_income", JSON.stringify(existing));

    // Append to history
    const entry: HistoryEntry = {
      id:          `${Date.now()}`,
      companyId,
      companyName,
      savedAt:     new Date().toISOString(),
      rows:        filled,
      total,
    };
    const prev = JSON.parse(localStorage.getItem(HIST_KEY) ?? "[]");
    const updated = [entry, ...prev];
    localStorage.setItem(HIST_KEY, JSON.stringify(updated));
    setHistData(updated);

    // Reset form and show toast
    nextId = 1;
    setRows([makeRow(), makeRow()]);
    setError("");
    setSuccessMsg(`Income saved — SAR ${money(total)}`);
    setTimeout(() => setSuccessMsg(""), 5000);
    setHistOpen(true);
  }

  function deleteHistoryEntry(entryId: string) {
    const updated = histData.filter(e => e.id !== entryId);
    localStorage.setItem(HIST_KEY, JSON.stringify(updated));
    setHistData(updated);
  }

  function exportToExcel() {
    if (histData.length === 0) return;
    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Full Income Report ─────────────────────────────────────────
    const allRows: (string | number)[][] = [];
    let rowNum = 1;
    histData.forEach(entry => {
      entry.rows.forEach(row => {
        allRows.push([
          rowNum++,
          entry.companyName,
          row.bankName,
          row.month,
          num(row.amount),
          new Date(entry.savedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
          new Date(entry.savedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
        ]);
      });
    });

    const grandTotal = histData.reduce((s, e) => s + e.total, 0);

    const sheet1Data: (string | number | null)[][] = [
      ["NAMMA DASHBOARD — CURRENT INCOME REPORT", null, null, null, null, null, null],
      [`Generated: ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })} ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`, null, null, null, null, null, null],
      [`Total Submissions: ${histData.length}`, null, null, null, null, null, null],
      [`Total Entries: ${allRows.length}`, null, null, null, null, null, null],
      [`Grand Total (SAR): ${money(grandTotal)}`, null, null, null, null, null, null],
      [],
      ["#", "Company Name", "Bank Name", "Month", "Amount (SAR)", "Saved Date", "Saved Time"],
      ...allRows,
      [],
      [null, null, null, "GRAND TOTAL (SAR)", grandTotal, null, null],
    ];

    const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
    ws1["!cols"] = [{ wch: 5 }, { wch: 42 }, { wch: 26 }, { wch: 20 }, { wch: 18 }, { wch: 16 }, { wch: 12 }];
    applyStyles(ws1, { metaEnd: 4, headerRow: 6, dataStart: 7, dataEnd: 6 + allRows.length, totalRow: 8 + allRows.length, amountCols: [4], accent: "059669", colCount: 7 });
    XLSX.utils.book_append_sheet(wb, ws1, "Income Report");

    // ── Sheet 2: Bank Summary ───────────────────────────────────────────────
    const bankMap: Record<string, { total: number; count: number }> = {};
    histData.forEach(entry => {
      entry.rows.forEach(row => {
        if (!bankMap[row.bankName]) bankMap[row.bankName] = { total: 0, count: 0 };
        bankMap[row.bankName].total += num(row.amount);
        bankMap[row.bankName].count += 1;
      });
    });

    const bankEntries = Object.entries(bankMap).sort((a, b) => b[1].total - a[1].total);
    const bankGrandTotal = bankEntries.reduce((s, [, v]) => s + v.total, 0);

    const sheet2Data: (string | number | null)[][] = [
      ["BANK SUMMARY", null, null, null],
      [`Generated: ${new Date().toLocaleDateString("en-GB")}`, null, null, null],
      [],
      ["Bank Name", "No. of Entries", "Total (SAR)", "Share (%)"],
      ...bankEntries.map(([bank, v], i) => [
        bank,
        v.count,
        v.total,
        bankGrandTotal > 0 ? parseFloat(((v.total / bankGrandTotal) * 100).toFixed(2)) : 0,
      ]),
      [],
      ["TOTAL", bankEntries.reduce((s, [, v]) => s + v.count, 0), bankGrandTotal, 100],
    ];

    const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
    ws2["!cols"] = [{ wch: 32 }, { wch: 16 }, { wch: 18 }, { wch: 12 }];
    applyStyles(ws2, { metaEnd: 1, headerRow: 3, dataStart: 4, dataEnd: 3 + bankEntries.length, totalRow: 5 + bankEntries.length, amountCols: [2], accent: "059669", colCount: 4 });
    XLSX.utils.book_append_sheet(wb, ws2, "Bank Summary");

    // ── Sheet 3: Monthly Summary (chart-ready) ──────────────────────────────
    const monthMap: Record<string, number> = {};
    histData.forEach(entry => {
      entry.rows.forEach(row => {
        monthMap[row.month] = (monthMap[row.month] ?? 0) + num(row.amount);
      });
    });

    const sortedMonths = Object.entries(monthMap).sort((a, b) => {
      const p = (s: string) => new Date(`${s.split(" ")[0]} 1, ${s.split(" ")[1]}`).getTime();
      return p(a[0]) - p(b[0]);
    });

    const sheet3Data: (string | number | null)[][] = [
      ["MONTHLY INCOME SUMMARY — CHART DATA", null],
      ["Tip: Select Month & Total columns → Insert → Chart to create a bar chart", null],
      [],
      ["Month", "Total Income (SAR)"],
      ...sortedMonths.map(([month, total]) => [month, total]),
      [],
      ["TOTAL", sortedMonths.reduce((s, [, v]) => s + v, 0)],
    ];

    const ws3 = XLSX.utils.aoa_to_sheet(sheet3Data);
    ws3["!cols"] = [{ wch: 22 }, { wch: 22 }];
    applyStyles(ws3, { metaEnd: 1, headerRow: 3, dataStart: 4, dataEnd: 3 + sortedMonths.length, totalRow: 5 + sortedMonths.length, amountCols: [1], accent: "059669", colCount: 2 });
    XLSX.utils.book_append_sheet(wb, ws3, "Monthly Summary");

    // ── Sheet 4: Per-Company Summary ────────────────────────────────────────
    const companyMap: Record<string, { name: string; total: number; count: number }> = {};
    histData.forEach(entry => {
      if (!companyMap[entry.companyId]) companyMap[entry.companyId] = { name: entry.companyName, total: 0, count: 0 };
      companyMap[entry.companyId].total += entry.total;
      companyMap[entry.companyId].count += entry.rows.length;
    });

    const companyEntries = Object.entries(companyMap).sort((a, b) => b[1].total - a[1].total);
    const companyGrandTotal = companyEntries.reduce((s, [, v]) => s + v.total, 0);

    const sheet4Data: (string | number | null)[][] = [
      ["COMPANY INCOME SUMMARY", null, null, null],
      [`Generated: ${new Date().toLocaleDateString("en-GB")}`, null, null, null],
      [],
      ["Company Name", "No. of Entries", "Total (SAR)", "Share (%)"],
      ...companyEntries.map(([, v]) => [
        v.name,
        v.count,
        v.total,
        companyGrandTotal > 0 ? parseFloat(((v.total / companyGrandTotal) * 100).toFixed(2)) : 0,
      ]),
      [],
      ["TOTAL", companyEntries.reduce((s, [, v]) => s + v.count, 0), companyGrandTotal, 100],
    ];

    const ws4 = XLSX.utils.aoa_to_sheet(sheet4Data);
    ws4["!cols"] = [{ wch: 44 }, { wch: 16 }, { wch: 18 }, { wch: 12 }];
    applyStyles(ws4, { metaEnd: 1, headerRow: 3, dataStart: 4, dataEnd: 3 + companyEntries.length, totalRow: 5 + companyEntries.length, amountCols: [2], accent: "059669", colCount: 4 });
    XLSX.utils.book_append_sheet(wb, ws4, "Company Summary");

    const fileName = `Income_Report_${new Date().toISOString().split("T")[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }

  // ── mini bar chart for history preview ─────────────────────────────────────
  const histBankTotals = useMemo(() => {
    const map: Record<string, number> = {};
    histData.forEach(e => e.rows.forEach(r => {
      map[r.bankName] = (map[r.bankName] ?? 0) + num(r.amount);
    }));
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
    const max = entries[0]?.[1] ?? 1;
    return { entries, max };
  }, [histData]);

  const histGrandTotal = useMemo(() => histData.reduce((s, e) => s + e.total, 0), [histData]);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#F4F6FA" }}>
      <PageHeader onLogout={() => router.push("/login")} />

      <main className="flex-1 w-full px-4 md:px-8 py-8">
        <div className="mx-auto max-w-4xl">

          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-xs text-gray-400 mb-4">
            <Link href="/dashboard" className="hover:text-[#1B3A6B] transition-colors">Dashboard</Link>
            <ChevronRight size={12} />
            <Link href="/dashboard/finance" className="hover:text-[#1B3A6B] transition-colors">Finance</Link>
            <ChevronRight size={12} />
            <Link href="/dashboard/account" className="hover:text-[#1B3A6B] transition-colors">Account</Link>
            <ChevronRight size={12} />
            <span className="text-gray-600 font-medium">Current Income</span>
          </nav>

          {/* Page title */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm"
              style={{ background: `linear-gradient(135deg, ${BRAND}, #2a5a9e)` }}>
              <TrendingUp size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Current Income</h1>
              <p className="text-sm text-gray-500">Add bank entries and calculate total payment</p>
            </div>
          </div>

          {/* Success toast */}
          {successMsg && (
            <div className="mb-4 flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
              <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0" />
              <span className="text-sm font-semibold text-emerald-700">{successMsg}</span>
            </div>
          )}

          {/* Form card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-5">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Bank Entries</span>
              <span className="text-xs text-gray-400">
                {rows.filter(r => r.bankName.trim() || num(r.amount) > 0).length} entr{rows.filter(r => r.bankName.trim() || num(r.amount) > 0).length === 1 ? "y" : "ies"}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr style={{ backgroundColor: BRAND }} className="text-white text-xs uppercase tracking-wide">
                    <th className="px-4 py-3 text-center w-10">#</th>
                    <th className="px-4 py-3 text-left">Bank Name</th>
                    <th className="px-4 py-3 text-left w-44">Month</th>
                    <th className="px-4 py-3 text-right w-40">Amount (SAR)</th>
                    <th className="px-3 py-3 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={row.id} className={`border-b border-gray-100 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}`}>
                      <td className="px-4 py-3 text-center text-xs font-semibold text-gray-400">{idx + 1}</td>
                      <td className="px-3 py-2.5">
                        <select
                          value={row.bankName}
                          onChange={(e) => updateRow(row.id, "bankName", e.target.value)}
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-[#1B3A6B] focus:ring-1 focus:ring-[#1B3A6B]/20 transition-colors"
                        >
                          <option value="">Select a bank…</option>
                          {SAUDI_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2.5">
                        <select
                          value={row.month}
                          onChange={(e) => updateRow(row.id, "month", e.target.value)}
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-[#1B3A6B] focus:ring-1 focus:ring-[#1B3A6B]/20 transition-colors"
                        >
                          {MONTHS.map(m => (
                            <option key={m} value={m} style={{ fontWeight: m === CURRENT_MONTH ? 700 : 400 }}>
                              {m === CURRENT_MONTH ? `${m} (Current)` : m}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="number" step="0.01" min="0" placeholder="0.00"
                          value={row.amount}
                          onChange={(e) => updateRow(row.id, "amount", e.target.value)}
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder:text-gray-300 text-right focus:outline-none focus:border-[#1B3A6B] focus:ring-1 focus:ring-[#1B3A6B]/20 transition-colors tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {rows.length > 1 && (
                          <button type="button" onClick={() => removeRow(row.id)}
                            className="text-gray-300 hover:text-red-400 transition-colors" aria-label="Remove row">
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-3 border-t border-gray-100">
              <button type="button" onClick={addRow}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-[#1B3A6B] transition-colors font-medium">
                <Plus size={15} /> Add Bank
              </button>
            </div>
          </div>

          {/* Total payment bar */}
          <div className="rounded-2xl px-6 py-4 mb-5 flex items-center justify-between" style={{ backgroundColor: BRAND }}>
            <span className="text-sm font-bold uppercase tracking-wider text-white/70">Total Payment</span>
            <span className="text-2xl font-bold tabular-nums text-white">SAR {money(total)}</span>
          </div>

          {error && (
            <p className="text-sm text-red-500 mb-4 text-center bg-red-50 border border-red-100 rounded-xl py-2">{error}</p>
          )}

          <div className="flex items-center justify-end gap-3 mb-12">
            <Link href="/dashboard/account"
              className="rounded-full px-6 py-3 text-sm font-semibold text-gray-600 bg-white border border-gray-200 hover:border-[#1B3A6B]/30 transition-colors">
              Cancel
            </Link>
            <button onClick={handleSubmit}
              className="rounded-full px-8 py-3 text-sm font-semibold text-white flex items-center gap-2 transition-all hover:shadow-lg"
              style={{ backgroundColor: BRAND, boxShadow: `0 4px 14px ${BRAND}44` }}>
              <Save size={16} /> Save
            </button>
          </div>

          {/* ── History Section ───────────────────────────────────────────── */}
          <div className="mb-10">

            {/* History header */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setHistOpen(o => !o)}
                className="flex items-center gap-2.5 group"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm"
                  style={{ background: `linear-gradient(135deg, #059669, #047857)` }}>
                  <History size={18} />
                </div>
                <div className="text-left">
                  <h2 className="text-lg font-bold text-gray-800 group-hover:text-[#1B3A6B] transition-colors">
                    Submission History
                    {histData.length > 0 && (
                      <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
                        {histData.length} saved
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-gray-400">All submitted income entries across companies</p>
                </div>
                <ChevronRight size={16} className={`text-gray-400 transition-transform ${histOpen ? "rotate-90" : ""}`} />
              </button>

              {histData.length > 0 && (
                <button
                  onClick={exportToExcel}
                  className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all hover:shadow-md active:scale-95"
                  style={{ backgroundColor: "#059669", boxShadow: "0 2px 8px #05966940" }}
                >
                  <Download size={15} /> Export to Excel
                </button>
              )}
            </div>

            {histOpen && (
              <>
                {histData.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 flex flex-col items-center gap-3 text-center">
                    <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center">
                      <History size={26} className="text-gray-300" />
                    </div>
                    <p className="text-sm text-gray-400 font-medium">No submissions yet</p>
                    <p className="text-xs text-gray-300">Save your first income entry above to see it here</p>
                  </div>
                ) : (
                  <>
                    {/* Summary stats */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Banknote size={14} className="text-emerald-500" />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Grand Total</span>
                        </div>
                        <p className="text-lg font-bold text-gray-800 tabular-nums">SAR {money(histGrandTotal)}</p>
                      </div>
                      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Building2 size={14} className="text-blue-500" />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Companies</span>
                        </div>
                        <p className="text-lg font-bold text-gray-800">
                          {new Set(histData.map(e => e.companyId)).size}
                        </p>
                      </div>
                      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Calendar size={14} className="text-purple-500" />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Entries</span>
                        </div>
                        <p className="text-lg font-bold text-gray-800">
                          {histData.reduce((s, e) => s + e.rows.length, 0)}
                        </p>
                      </div>
                    </div>

                    {/* Mini bank bar chart */}
                    {histBankTotals.entries.length > 0 && (
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">Income by Bank</h3>
                        <div className="flex flex-col gap-3">
                          {histBankTotals.entries.map(([bank, total]) => {
                            const pct = histBankTotals.max > 0 ? (total / histBankTotals.max) * 100 : 0;
                            const share = histGrandTotal > 0 ? (total / histGrandTotal) * 100 : 0;
                            return (
                              <div key={bank} className="flex items-center gap-3">
                                <span className="text-[11px] text-gray-600 w-44 flex-shrink-0 truncate font-medium">{bank}</span>
                                <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full flex items-center justify-end pr-2 transition-all duration-700"
                                    style={{ width: `${pct}%`, backgroundColor: BRAND, minWidth: pct > 0 ? "24px" : "0" }}
                                  >
                                    {pct > 15 && (
                                      <span className="text-[9px] font-bold text-white">{share.toFixed(1)}%</span>
                                    )}
                                  </div>
                                </div>
                                <span className="text-[11px] font-bold text-gray-700 tabular-nums w-28 text-right flex-shrink-0">
                                  SAR {money(total)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* History entries table */}
                    {histData.map((entry, ei) => (
                      <div key={entry.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-3">
                        {/* Entry header */}
                        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg text-white text-[10px] font-bold flex-shrink-0"
                              style={{ backgroundColor: BRAND }}>
                              {ei + 1}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-gray-700 leading-tight">{entry.companyName}</p>
                              <p className="text-[10px] text-gray-400 mt-0.5">
                                {new Date(entry.savedAt).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
                                {" · "}
                                {new Date(entry.savedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-[10px] text-gray-400 uppercase tracking-wider">Total</p>
                              <p className="text-sm font-bold text-gray-800 tabular-nums">SAR {money(entry.total)}</p>
                            </div>
                            <button
                              onClick={() => deleteHistoryEntry(entry.id)}
                              className="text-gray-300 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-50"
                              title="Delete this entry"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        {/* Entry rows */}
                        <table className="w-full text-sm min-w-[520px]">
                          <thead>
                            <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                              <th className="px-5 py-2 text-center w-10">#</th>
                              <th className="px-4 py-2 text-left">Bank Name</th>
                              <th className="px-4 py-2 text-left w-40">Month</th>
                              <th className="px-5 py-2 text-right w-36">Amount (SAR)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entry.rows.map((row, ri) => (
                              <tr key={row.id ?? ri} className={`border-b border-gray-100 ${ri % 2 === 0 ? "bg-white" : "bg-gray-50/40"}`}>
                                <td className="px-5 py-2.5 text-center text-xs text-gray-400">{ri + 1}</td>
                                <td className="px-4 py-2.5 text-sm font-medium text-gray-700">{row.bankName}</td>
                                <td className="px-4 py-2.5 text-sm text-gray-500">{row.month}</td>
                                <td className="px-5 py-2.5 text-right tabular-nums text-sm font-semibold text-emerald-600">
                                  {money(num(row.amount))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}

function PageHeader({ onLogout }: { onLogout: () => void }) {
  return (
    <header className="w-full flex items-center justify-between px-6 py-3 shadow-md gap-4 relative z-20" style={{ backgroundColor: BRAND }}>
      <Link href="/dashboard"><Image src="/logo.png" alt="Diamond Star Arabia" width={110} height={65} className="object-contain brightness-0 invert flex-shrink-0 cursor-pointer" /></Link>
      <div className="flex-1 flex justify-center">
        <CompanySelector single />
      </div>
      <button onClick={onLogout} className="flex items-center gap-2 text-white/80 hover:text-white text-sm font-medium transition-colors flex-shrink-0">
        <LogOut size={16} /> Log out
      </button>
    </header>
  );
}
