"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  TrendingUp,
  TrendingDown,
  ChevronRight,
  LogOut,
  Landmark,
  Wallet,
  CreditCard,
} from "lucide-react";
import CompanySelector from "@/components/company-selector";

const BRAND = "#1B3A6B";

export default function AccountPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#F4F6FA" }}>
      {/* Navbar */}
      <header
        className="w-full flex items-center justify-between px-6 py-3 shadow-md gap-4 relative z-20"
        style={{ backgroundColor: BRAND }}
      >
        <Image
          src="/logo.png"
          alt="Diamond Star Arabia"
          width={110}
          height={65}
          className="object-contain brightness-0 invert"
        />
        <div className="flex-1 flex justify-center">
          <CompanySelector />
        </div>
        <button
          onClick={() => router.push("/login")}
          className="flex items-center gap-2 text-white/80 hover:text-white text-sm font-medium transition-colors flex-shrink-0"
        >
          <LogOut size={16} />
          Log out
        </button>
      </header>

      <main className="flex-1 w-full px-4 md:px-8 py-8">
        <div className="mx-auto max-w-5xl">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-xs text-gray-400 mb-4">
            <Link href="/dashboard" className="hover:text-[#1B3A6B] transition-colors">Dashboard</Link>
            <ChevronRight size={12} />
            <Link href="/dashboard/finance" className="hover:text-[#1B3A6B] transition-colors">Finance</Link>
            <ChevronRight size={12} />
            <span className="text-gray-600 font-medium">Account</span>
          </nav>

          {/* Header */}
          <div className="flex items-center gap-3 mb-1">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm"
              style={{ background: `linear-gradient(135deg, ${BRAND}, #2a5a9e)` }}
            >
              <Landmark size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Account</h1>
              <p className="text-sm text-gray-500">Financial accounting modules</p>
            </div>
          </div>

          <div className="border-t border-gray-200 my-6" />

          {/* Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Current Income */}
            <Link
              href="/dashboard/account/current-income"
              className="group relative overflow-hidden flex items-center gap-4 bg-white rounded-2xl pl-6 pr-5 py-4 border border-gray-100 hover:border-[#1B3A6B]/30 hover:shadow-md cursor-pointer transition-all duration-150"
              style={{ color: "#059669" }}
            >
              <span className="absolute left-0 top-0 h-full w-1" style={{ background: "#059669" }} />
              <div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#ECFDF5" }}>
                <TrendingUp size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-base font-semibold text-gray-800 group-hover:text-[#1B3A6B] transition-colors">
                    Current Income
                  </p>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                    Ready
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5 truncate">View and manage current income entries</p>
              </div>
              <ChevronRight size={18} className="flex-shrink-0 text-gray-300 group-hover:text-[#1B3A6B] transition-colors" />
            </Link>

            {/* Current Payables */}
            <Link
              href="/dashboard/account/current-payables"
              className="group relative overflow-hidden flex items-center gap-4 bg-white rounded-2xl pl-6 pr-5 py-4 border border-gray-100 hover:border-[#1B3A6B]/30 hover:shadow-md cursor-pointer transition-all duration-150"
              style={{ color: "#DC2626" }}
            >
              <span className="absolute left-0 top-0 h-full w-1" style={{ background: "#DC2626" }} />
              <div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#FEF2F2" }}>
                <TrendingDown size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-base font-semibold text-gray-800 group-hover:text-[#1B3A6B] transition-colors">
                    Current Payables
                  </p>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                    Ready
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5 truncate">View and manage current payable entries</p>
              </div>
              <ChevronRight size={18} className="flex-shrink-0 text-gray-300 group-hover:text-[#1B3A6B] transition-colors" />
            </Link>

            {/* Current Receivables */}
            <Link
              href="/dashboard/account/current-receivables"
              className="group relative overflow-hidden flex items-center gap-4 bg-white rounded-2xl pl-6 pr-5 py-4 border border-gray-100 hover:border-[#1B3A6B]/30 hover:shadow-md cursor-pointer transition-all duration-150"
              style={{ color: "#0891B2" }}
            >
              <span className="absolute left-0 top-0 h-full w-1" style={{ background: "#0891B2" }} />
              <div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#ECFEFF" }}>
                <Wallet size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-base font-semibold text-gray-800 group-hover:text-[#1B3A6B] transition-colors">
                    Current Receivables
                  </p>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                    Ready
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5 truncate">View and manage current receivable entries</p>
              </div>
              <ChevronRight size={18} className="flex-shrink-0 text-gray-300 group-hover:text-[#1B3A6B] transition-colors" />
            </Link>

            {/* Current Expenses */}
            <Link
              href="/dashboard/account/current-expenses"
              className="group relative overflow-hidden flex items-center gap-4 bg-white rounded-2xl pl-6 pr-5 py-4 border border-gray-100 hover:border-[#1B3A6B]/30 hover:shadow-md cursor-pointer transition-all duration-150"
              style={{ color: "#D97706" }}
            >
              <span className="absolute left-0 top-0 h-full w-1" style={{ background: "#D97706" }} />
              <div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#FFFBEB" }}>
                <CreditCard size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-base font-semibold text-gray-800 group-hover:text-[#1B3A6B] transition-colors">
                    Current Expenses
                  </p>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                    Ready
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5 truncate">View and manage current expense entries</p>
              </div>
              <ChevronRight size={18} className="flex-shrink-0 text-gray-300 group-hover:text-[#1B3A6B] transition-colors" />
            </Link>

          </div>
        </div>
      </main>
    </div>
  );
}
