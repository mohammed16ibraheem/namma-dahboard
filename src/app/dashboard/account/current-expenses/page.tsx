"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LogOut,
  ChevronRight,
  CreditCard,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
} from "lucide-react";
import CompanySelector from "@/components/company-selector";

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

interface ExpenseRow {
  id: number;
  expenseName: string;
  month: string;
  amount: string;
}

let nextId = 1;
const makeRow = (): ExpenseRow => ({ id: nextId++, expenseName: "", month: CURRENT_MONTH, amount: "" });

const num = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CurrentExpensesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ExpenseRow[]>([makeRow(), makeRow()]);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const total = useMemo(
    () => rows.reduce((sum, r) => sum + num(r.amount), 0),
    [rows]
  );

  function updateRow(id: number, field: keyof Omit<ExpenseRow, "id">, value: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    setError("");
  }

  function addRow() {
    setRows((prev) => [...prev, makeRow()]);
  }

  function removeRow(id: number) {
    if (rows.length === 1) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function handleSubmit() {
    const filled = rows.filter((r) => r.expenseName.trim() || num(r.amount) > 0);
    if (filled.length === 0) {
      setError("Please add at least one expense entry.");
      return;
    }
    const incomplete = filled.find((r) => !r.expenseName.trim() || num(r.amount) <= 0);
    if (incomplete) {
      setError("Each row needs an Expense Name and an Amount greater than 0.");
      return;
    }
    const companyId = localStorage.getItem("active_company") ?? "diamond-star";
    const existing = JSON.parse(localStorage.getItem("account_expenses") ?? "{}");
    existing[companyId] = { rows: filled, total };
    localStorage.setItem("account_expenses", JSON.stringify(existing));
    setSubmitted(true);
  }

  function resetForm() {
    nextId = 1;
    setRows([makeRow(), makeRow()]);
    setSubmitted(false);
    setError("");
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#F4F6FA" }}>
        <PageHeader onLogout={() => router.push("/login")} />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="flex flex-col items-center gap-4 text-center max-w-md">
            <div className="w-20 h-20 rounded-full flex items-center justify-center bg-emerald-50">
              <CheckCircle2 size={42} className="text-emerald-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800">Expenses Saved</h2>
            <p className="text-sm text-gray-500">
              Total Amount:{" "}
              <span className="font-bold text-gray-800">SAR {money(total)}</span>
            </p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={resetForm}
                className="rounded-full px-6 py-2.5 text-sm font-semibold text-white"
                style={{ backgroundColor: BRAND }}
              >
                New Entry
              </button>
              <Link
                href="/dashboard/account"
                className="rounded-full px-6 py-2.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 hover:border-[#1B3A6B]/30 transition-colors"
              >
                Back to Account
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
            <span className="text-gray-600 font-medium">Current Expenses</span>
          </nav>

          {/* Page title */}
          <div className="flex items-center gap-3 mb-6">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm"
              style={{ background: "linear-gradient(135deg, #D97706, #f59e0b)" }}
            >
              <CreditCard size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Current Expenses</h1>
              <p className="text-sm text-gray-500">Add expense entries and calculate total expense amount</p>
            </div>
          </div>

          {/* Form card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-5">

            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Expense Entries</span>
              <span className="text-xs text-gray-400">
                {rows.filter(r => r.expenseName.trim() || num(r.amount) > 0).length} entr{rows.filter(r => r.expenseName.trim() || num(r.amount) > 0).length === 1 ? "y" : "ies"}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr style={{ backgroundColor: BRAND }} className="text-white text-xs uppercase tracking-wide">
                    <th className="px-4 py-3 text-center w-10">#</th>
                    <th className="px-4 py-3 text-left">Expense Name</th>
                    <th className="px-4 py-3 text-left w-44">Month</th>
                    <th className="px-4 py-3 text-right w-40">Amount (SAR)</th>
                    <th className="px-3 py-3 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr
                      key={row.id}
                      className={`border-b border-gray-100 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}`}
                    >
                      <td className="px-4 py-3 text-center text-xs font-semibold text-gray-400">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="text"
                          placeholder="e.g. Office Rent"
                          value={row.expenseName}
                          onChange={(e) => updateRow(row.id, "expenseName", e.target.value)}
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:border-[#1B3A6B] focus:ring-1 focus:ring-[#1B3A6B]/20 transition-colors"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <select
                          value={row.month}
                          onChange={(e) => updateRow(row.id, "month", e.target.value)}
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-[#1B3A6B] focus:ring-1 focus:ring-[#1B3A6B]/20 transition-colors"
                        >
                          {MONTHS.map((m) => (
                            <option key={m} value={m}
                              style={{ fontWeight: m === CURRENT_MONTH ? 700 : 400 }}
                            >
                              {m === CURRENT_MONTH ? `${m} (Current)` : m}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={row.amount}
                          onChange={(e) => updateRow(row.id, "amount", e.target.value)}
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder:text-gray-300 text-right focus:outline-none focus:border-[#1B3A6B] focus:ring-1 focus:ring-[#1B3A6B]/20 transition-colors tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {rows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeRow(row.id)}
                            className="text-gray-300 hover:text-red-400 transition-colors"
                            aria-label="Remove row"
                          >
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
              <button
                type="button"
                onClick={addRow}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-[#1B3A6B] transition-colors font-medium"
              >
                <Plus size={15} /> Add Expense
              </button>
            </div>
          </div>

          {/* Total amount bar */}
          <div
            className="rounded-2xl px-6 py-4 mb-5 flex items-center justify-between"
            style={{ backgroundColor: BRAND }}
          >
            <span className="text-sm font-bold uppercase tracking-wider text-white/70">Total Expenses</span>
            <span className="text-2xl font-bold tabular-nums text-white">SAR {money(total)}</span>
          </div>

          {error && (
            <p className="text-sm text-red-500 mb-4 text-center bg-red-50 border border-red-100 rounded-xl py-2">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pb-10">
            <Link
              href="/dashboard/account"
              className="rounded-full px-6 py-3 text-sm font-semibold text-gray-600 bg-white border border-gray-200 hover:border-[#1B3A6B]/30 transition-colors"
            >
              Cancel
            </Link>
            <button
              onClick={handleSubmit}
              className="rounded-full px-8 py-3 text-sm font-semibold text-white flex items-center gap-2 transition-all hover:shadow-lg"
              style={{ backgroundColor: BRAND, boxShadow: `0 4px 14px ${BRAND}44` }}
            >
              <Save size={16} /> Save
            </button>
          </div>

        </div>
      </main>
    </div>
  );
}

function PageHeader({ onLogout }: { onLogout: () => void }) {
  return (
    <header className="w-full flex items-center justify-between px-6 py-3 shadow-md gap-4 relative z-20" style={{ backgroundColor: BRAND }}>
      <Image src="/logo.png" alt="Diamond Star Arabia" width={110} height={65} className="object-contain brightness-0 invert flex-shrink-0" />
      <div className="flex-1 flex justify-center">
        <CompanySelector single />
      </div>
      <button onClick={onLogout} className="flex items-center gap-2 text-white/80 hover:text-white text-sm font-medium transition-colors flex-shrink-0">
        <LogOut size={16} /> Log out
      </button>
    </header>
  );
}
