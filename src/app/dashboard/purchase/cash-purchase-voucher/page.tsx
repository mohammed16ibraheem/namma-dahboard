"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LogOut,
  ChevronRight,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  Calendar,
  Hash,
  Building2,
  Warehouse,
  MapPin,
  Layers,
  User,
  ReceiptText,
} from "lucide-react";

const BRAND = "#1B3A6B";
const CURRENCY = "SAR";

// ── Option lists (editable defaults sourced from the purchases register) ──
const PURCHASE_ACCOUNTS = ["Raw Material Inventory", "Purchase Control A/C", "Trading Purchase"];
const WAREHOUSES = ["Green City-Unit-1", "WPD Unit - 1", "WPD Unit - 2", "Namma Unit - 1"];
const DIVISIONS = ["WPD UNIT - 1", "WPD UNIT - 2", "Trading"];
const DEPARTMENTS = ["Operation", "Administration", "Finance", "Maintenance"];
const PLACES_OF_SUPPLY = ["Jeddah", "Riyadh", "Dammam", "Makkah", "Madinah"];
const ITEM_SUGGESTIONS = ["OCC", "MIX WASTE", "HMS", "UNUSED FOILS", "MIX SCRAP", "ASA", "ALUM TUBE"];

// ── Types ──
// Line items mirror the purchases register: Way Bill · Item · Qty · Rate · Gross · VAT · Remarks
interface Line {
  wayBill: string;
  itemName: string;
  quantity: string;
  rate: string;
  vat: string;
  remarks: string;
}

const emptyLine = (): Line => ({
  wayBill: "",
  itemName: "",
  quantity: "",
  rate: "",
  vat: "0",
  remarks: "",
});

const num = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Header {
  documentNo: string;
  date: string;
  purchaseAccount: string; // "Supplier Name" / inventory account in the register
  name: string;            // e.g. JV GREEN CITY
  supplierName: string;    // e.g. JaamJoom Pharma
  sourceName: string;      // e.g. JaamJoom Pharma
  warehouse: string;
  division: string;
  department: string;
  placeOfSupply: string;
  raiseReceipt: boolean;
  roundOff: string;        // voucher-level, editable → adjusts Net Total
  narration: string;
}

export default function CashPurchaseVoucherPage() {
  const router = useRouter();

  const [header, setHeader] = useState<Header>({
    documentNo: "",
    date: "",
    purchaseAccount: PURCHASE_ACCOUNTS[0],
    name: "",
    supplierName: "",
    sourceName: "",
    warehouse: WAREHOUSES[0],
    division: DIVISIONS[0],
    department: DEPARTMENTS[0],
    placeOfSupply: PLACES_OF_SUPPLY[0],
    raiseReceipt: false,
    roundOff: "0",
    narration: "",
  });

  const [lines, setLines] = useState<Line[]>([emptyLine(), emptyLine(), emptyLine(), emptyLine()]);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  // Set the date on the client only (avoids hydration mismatch)
  useEffect(() => {
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    setHeader((h) => ({ ...h, date: iso }));
  }, []);

  function setH<K extends keyof Header>(key: K, value: Header[K]) {
    setHeader((h) => ({ ...h, [key]: value }));
  }

  function setLine(idx: number, key: keyof Line, value: string) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [key]: value } : l)));
    setError("");
  }

  function addRow() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeRow(idx: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  }

  // ── Live totals — Net Total recomputes from Gross + VAT + (editable) Round Off ──
  const totals = useMemo(() => {
    let qty = 0, gross = 0, vat = 0;
    lines.forEach((l) => {
      qty += num(l.quantity);
      gross += num(l.quantity) * num(l.rate);
      vat += num(l.vat);
    });
    const roundOff = num(header.roundOff);
    const net = gross + vat + roundOff;
    return { qty, gross, vat, roundOff, net };
  }, [lines, header.roundOff]);

  const filledLines = lines.filter((l) => l.itemName.trim() || num(l.quantity) > 0);

  function handleSubmit() {
    if (filledLines.length === 0) {
      setError("Add at least one line item with an item name and quantity.");
      return;
    }
    const incomplete = filledLines.find((l) => !l.itemName.trim() || num(l.quantity) <= 0 || num(l.rate) <= 0);
    if (incomplete) {
      setError("Each line needs an Item Name, a Quantity and a Rate greater than 0.");
      return;
    }
    if (!header.documentNo.trim()) {
      setError("Document No is required.");
      return;
    }

    const payload = {
      ...header,
      lines: filledLines.map((l) => ({
        wayBill: l.wayBill,
        itemName: l.itemName,
        quantity: num(l.quantity),
        rate: num(l.rate),
        gross: num(l.quantity) * num(l.rate),
        vat: num(l.vat),
        remarks: l.remarks,
      })),
      totals,
    };
    // eslint-disable-next-line no-console
    console.log("Cash Purchase Voucher:", payload);
    setSubmitted(true);
  }

  function resetForm() {
    setLines([emptyLine(), emptyLine(), emptyLine(), emptyLine()]);
    setHeader((h) => ({ ...h, documentNo: "", name: "", supplierName: "", sourceName: "", narration: "", raiseReceipt: false, roundOff: "0" }));
    setSubmitted(false);
    setError("");
  }

  // ── Success screen ──
  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#F4F6FA" }}>
        <PageHeader onLogout={() => router.push("/login")} />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="flex flex-col items-center gap-4 text-center max-w-md">
            <div className="w-20 h-20 rounded-full flex items-center justify-center bg-emerald-50">
              <CheckCircle2 size={42} className="text-emerald-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800">Voucher Saved</h2>
            <p className="text-sm text-gray-500">
              <span className="font-semibold text-gray-700">{header.documentNo}</span> recorded with{" "}
              {filledLines.length} item{filledLines.length !== 1 ? "s" : ""} · Net{" "}
              <span className="font-semibold text-gray-700">{CURRENCY} {money(totals.net)}</span>
            </p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={resetForm}
                className="rounded-full px-6 py-2.5 text-sm font-semibold text-white"
                style={{ backgroundColor: BRAND }}
              >
                New Voucher
              </button>
              <Link
                href="/dashboard/purchase"
                className="rounded-full px-6 py-2.5 text-sm font-semibold text-gray-600 bg-white border border-gray-200 hover:border-[#1B3A6B]/30 transition-colors"
              >
                Back to Purchase
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

      <main className="flex-1 w-full px-4 md:px-8 py-6">
        <div className="mx-auto max-w-6xl">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-xs text-gray-400 mb-4">
            <Link href="/dashboard" className="hover:text-[#1B3A6B] transition-colors">Dashboard</Link>
            <ChevronRight size={12} />
            <Link href="/dashboard/purchase" className="hover:text-[#1B3A6B] transition-colors">Purchase</Link>
            <ChevronRight size={12} />
            <span className="text-gray-600 font-medium">Cash Purchase Voucher</span>
          </nav>

          {/* Title */}
          <div className="flex items-center gap-3 mb-5">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm"
              style={{ background: `linear-gradient(135deg, ${BRAND}, #2a5a9e)` }}
            >
              <ReceiptText size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Cash Purchase Voucher</h1>
              <p className="text-sm text-gray-500">Record cash purchases & scrap / raw-material intake</p>
            </div>
          </div>

          {/* ── Voucher header card ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-5">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Voucher Details</span>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Document No" icon={<Hash size={14} />} required>
                <input
                  value={header.documentNo ?? ""}
                  onChange={(e) => setH("documentNo", e.target.value)}
                  placeholder="PUR-GC-26-1339"
                  className={inputClass}
                />
              </Field>

              <Field label="Date" icon={<Calendar size={14} />} required>
                <input
                  type="date"
                  value={header.date ?? ""}
                  onChange={(e) => setH("date", e.target.value)}
                  className={inputClass}
                />
              </Field>

              <Field label="Purchase Account" icon={<Layers size={14} />}>
                <select value={header.purchaseAccount ?? PURCHASE_ACCOUNTS[0]} onChange={(e) => setH("purchaseAccount", e.target.value)} className={selectClass}>
                  {PURCHASE_ACCOUNTS.map((a) => <option key={a}>{a}</option>)}
                </select>
              </Field>

              <Field label="Name" icon={<User size={14} />}>
                <input
                  value={header.name ?? ""}
                  onChange={(e) => setH("name", e.target.value)}
                  placeholder="e.g. JV GREEN CITY"
                  className={inputClass}
                />
              </Field>

              <Field label="Supplier Name" icon={<Building2 size={14} />}>
                <input
                  value={header.supplierName ?? ""}
                  onChange={(e) => setH("supplierName", e.target.value)}
                  placeholder="e.g. JaamJoom Pharma"
                  className={inputClass}
                />
              </Field>

              <Field label="Source Name" icon={<Building2 size={14} />}>
                <input
                  value={header.sourceName ?? ""}
                  onChange={(e) => setH("sourceName", e.target.value)}
                  placeholder="e.g. JaamJoom Pharma"
                  className={inputClass}
                />
              </Field>

              <Field label="Warehouse" icon={<Warehouse size={14} />}>
                <select value={header.warehouse ?? WAREHOUSES[0]} onChange={(e) => setH("warehouse", e.target.value)} className={selectClass}>
                  {WAREHOUSES.map((w) => <option key={w}>{w}</option>)}
                </select>
              </Field>

              <Field label="Place of Supply" icon={<MapPin size={14} />}>
                <select value={header.placeOfSupply ?? PLACES_OF_SUPPLY[0]} onChange={(e) => setH("placeOfSupply", e.target.value)} className={selectClass}>
                  {PLACES_OF_SUPPLY.map((p) => <option key={p}>{p}</option>)}
                </select>
              </Field>

              <Field label="Division">
                <select value={header.division ?? DIVISIONS[0]} onChange={(e) => setH("division", e.target.value)} className={selectClass}>
                  {DIVISIONS.map((d) => <option key={d}>{d}</option>)}
                </select>
              </Field>

              <Field label="Department">
                <select value={header.department ?? DEPARTMENTS[0]} onChange={(e) => setH("department", e.target.value)} className={selectClass}>
                  {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
                </select>
              </Field>

              {/* Raise Receipt toggle */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-gray-600">Raise Receipt</span>
                <button
                  type="button"
                  onClick={() => setH("raiseReceipt", !header.raiseReceipt)}
                  className="flex items-center justify-between bg-gray-50 rounded-xl border border-gray-200 px-3 h-11"
                >
                  <span className="text-sm text-gray-500">{header.raiseReceipt ? "Yes" : "No"}</span>
                  <span className={`relative w-11 h-6 rounded-full transition-colors ${header.raiseReceipt ? "bg-[#1B3A6B]" : "bg-gray-300"}`}>
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${header.raiseReceipt ? "translate-x-5" : "translate-x-0"}`} />
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* ── Line items card ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-5">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Items</span>
              <span className="text-xs text-gray-400">{filledLines.length} line{filledLines.length !== 1 ? "s" : ""}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead>
                  <tr style={{ backgroundColor: BRAND }} className="text-white text-xs uppercase tracking-wide">
                    <th className="px-3 py-3 text-center w-10">#</th>
                    <th className="px-3 py-3 text-left w-28">Way Bill</th>
                    <th className="px-3 py-3 text-left">Item Name</th>
                    <th className="px-3 py-3 text-right w-24">Quantity</th>
                    <th className="px-3 py-3 text-right w-24">Rate</th>
                    <th className="px-3 py-3 text-right w-28">Gross</th>
                    <th className="px-3 py-3 text-right w-20">VAT</th>
                    <th className="px-3 py-3 text-left w-44">Remarks</th>
                    <th className="px-2 py-3 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, idx) => {
                    const gross = num(l.quantity) * num(l.rate);
                    return (
                      <tr key={idx} className={`border-b border-gray-100 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                        <td className="px-3 py-2 text-center font-semibold text-gray-400">{idx + 1}</td>
                        <td className="px-2 py-2">
                          <input value={l.wayBill ?? ""} onChange={(e) => setLine(idx, "wayBill", e.target.value)} placeholder="93873" className={cellClass} />
                        </td>
                        <td className="px-2 py-2">
                          <input list="item-suggestions" value={l.itemName ?? ""} onChange={(e) => setLine(idx, "itemName", e.target.value)} placeholder="e.g. HMS" className={cellClass} />
                        </td>
                        <td className="px-2 py-2">
                          <input type="number" step="0.001" min="0" value={l.quantity ?? ""} onChange={(e) => setLine(idx, "quantity", e.target.value)} placeholder="0.000" className={`${cellClass} text-right`} />
                        </td>
                        <td className="px-2 py-2">
                          <input type="number" step="0.01" min="0" value={l.rate ?? ""} onChange={(e) => setLine(idx, "rate", e.target.value)} placeholder="0.00" className={`${cellClass} text-right`} />
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-700 tabular-nums">{money(gross)}</td>
                        <td className="px-2 py-2">
                          <input type="number" step="0.01" min="0" value={l.vat ?? ""} onChange={(e) => setLine(idx, "vat", e.target.value)} className={`${cellClass} text-right`} />
                        </td>
                        <td className="px-2 py-2">
                          <input value={l.remarks ?? ""} onChange={(e) => setLine(idx, "remarks", e.target.value)} placeholder="—" className={cellClass} />
                        </td>
                        <td className="px-1 py-2 text-center">
                          {lines.length > 1 && (
                            <button type="button" onClick={() => removeRow(idx)} className="text-gray-300 hover:text-red-400 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-[#1B3A6B]/5 border-t-2 border-[#1B3A6B]/20 font-semibold text-gray-700">
                    <td className="px-3 py-3" colSpan={3}>
                      <span className="text-xs uppercase tracking-wide text-gray-500">Total</span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{totals.qty.toLocaleString("en-US", { maximumFractionDigits: 3 })}</td>
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3 text-right tabular-nums">{money(totals.gross)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{money(totals.vat)}</td>
                    <td className="px-3 py-3" colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>

            <datalist id="item-suggestions">
              {ITEM_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
            </datalist>

            <div className="px-4 py-3 border-t border-gray-100">
              <button type="button" onClick={addRow} className="flex items-center gap-2 text-sm text-gray-500 hover:text-[#1B3A6B] transition-colors font-medium">
                <Plus size={15} /> Add Row
              </button>
            </div>
          </div>

          {/* ── Narration + summary ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <span className="text-xs font-semibold text-gray-600">Narration</span>
              <textarea
                rows={4}
                value={header.narration ?? ""}
                onChange={(e) => setH("narration", e.target.value)}
                placeholder="Any notes for this voucher..."
                className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-[#1B3A6B] focus:ring-2 focus:ring-[#1B3A6B]/20 focus:bg-white transition-colors resize-none"
              />
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Summary</span>
              <SummaryRow label="Gross" value={`${CURRENCY} ${money(totals.gross)}`} />
              <SummaryRow label="VAT" value={`${CURRENCY} ${money(totals.vat)}`} />

              {/* Editable Round Off — Net Total recalculates from it */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-gray-500">Round Off</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400">{CURRENCY}</span>
                  <input
                    type="number"
                    step="0.01"
                    value={header.roundOff ?? ""}
                    onChange={(e) => setH("roundOff", e.target.value)}
                    className="w-24 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-right text-gray-800 tabular-nums focus:outline-none focus:border-[#1B3A6B] focus:ring-1 focus:ring-[#1B3A6B]/20 focus:bg-white transition-colors"
                  />
                </div>
              </div>

              <div className="border-t border-gray-100 my-1" />
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-gray-800">Net Total</span>
                <span className="text-lg font-bold tabular-nums" style={{ color: BRAND }}>{CURRENCY} {money(totals.net)}</span>
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-500 mb-3 text-center bg-red-50 border border-red-100 rounded-xl py-2">{error}</p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pb-10">
            <Link
              href="/dashboard/purchase"
              className="rounded-full px-6 py-3 text-sm font-semibold text-gray-600 bg-white border border-gray-200 hover:border-[#1B3A6B]/30 transition-colors"
            >
              Cancel
            </Link>
            <button
              onClick={handleSubmit}
              className="rounded-full px-8 py-3 text-sm font-semibold text-white flex items-center gap-2 transition-all hover:shadow-lg"
              style={{ backgroundColor: BRAND, boxShadow: `0 4px 14px ${BRAND}44` }}
            >
              <Save size={16} /> Save Voucher
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

// ── Shared bits ──
const inputClass =
  "h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-[#1B3A6B] focus:ring-2 focus:ring-[#1B3A6B]/20 focus:bg-white transition-colors";
const selectClass =
  "h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-800 focus:outline-none focus:border-[#1B3A6B] focus:ring-2 focus:ring-[#1B3A6B]/20 focus:bg-white transition-colors";
const cellClass =
  "w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:border-[#1B3A6B] focus:ring-1 focus:ring-[#1B3A6B]/20";

function Field({
  label,
  icon,
  required,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
        {icon && <span className="text-gray-400">{icon}</span>}
        {label}
        {required && <span className="text-red-400">*</span>}
      </span>
      {children}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-gray-700 tabular-nums">{value}</span>
    </div>
  );
}

function PageHeader({ onLogout }: { onLogout: () => void }) {
  return (
    <header className="w-full flex items-center justify-between px-6 py-3 shadow-md" style={{ backgroundColor: BRAND }}>
      <Link href="/dashboard"><Image src="/logo.png" alt="Diamond Star Arabia" width={110} height={65} className="object-contain brightness-0 invert cursor-pointer" /></Link>
      <button onClick={onLogout} className="flex items-center gap-2 text-white/80 hover:text-white text-sm font-medium transition-colors">
        <LogOut size={16} /> Log out
      </button>
    </header>
  );
}
