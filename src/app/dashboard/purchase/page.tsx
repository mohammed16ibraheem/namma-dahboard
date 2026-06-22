"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  Undo2,
  Wallet,
  BookOpenCheck,
  Receipt,
  ChevronRight,
  LogOut,
  ShoppingCart,
} from "lucide-react";

const BRAND = "#1B3A6B";

type Option = {
  title: string;
  description: string;
  href: string | null;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  accent: string;
  bg: string;
  primary?: boolean;
};

const OPTIONS: Option[] = [
  {
    title: "Purchase Vouchers",
    description: "Credit purchase invoices received from suppliers",
    href: null,
    Icon: FileText,
    accent: "#2563EB",
    bg: "#EFF6FF",
  },
  {
    title: "Purchase Returns",
    description: "Return goods to suppliers & raise debit notes",
    href: null,
    Icon: Undo2,
    accent: "#DC2626",
    bg: "#FEF2F2",
  },
  {
    title: "Cash Purchase Voucher",
    description: "Record cash purchases & scrap / raw-material intake",
    href: "/dashboard/purchase/cash-purchase-voucher",
    Icon: Wallet,
    accent: "#059669",
    bg: "#ECFDF5",
    primary: true,
  },
  {
    title: "Accounts Purchase Entry",
    description: "Post purchases directly to ledger accounts",
    href: null,
    Icon: BookOpenCheck,
    accent: "#7C3AED",
    bg: "#F5F3FF",
  },
  {
    title: "Expense Purchase",
    description: "Operational overheads & expense purchases",
    href: null,
    Icon: Receipt,
    accent: "#EA580C",
    bg: "#FFF7ED",
  },
];

export default function PurchasePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#F4F6FA" }}>
      {/* Navbar */}
      <header
        className="w-full flex items-center justify-between px-6 py-3 shadow-md"
        style={{ backgroundColor: BRAND }}
      >
        <Image
          src="/logo.png"
          alt="Diamond Star Arabia"
          width={110}
          height={65}
          className="object-contain brightness-0 invert"
        />
        <button
          onClick={() => router.push("/login")}
          className="flex items-center gap-2 text-white/80 hover:text-white text-sm font-medium transition-colors"
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
            <Link href="/dashboard/operational" className="hover:text-[#1B3A6B] transition-colors">Operational</Link>
            <ChevronRight size={12} />
            <span className="text-gray-600 font-medium">Purchase</span>
          </nav>

          {/* Header */}
          <div className="flex items-center gap-3 mb-1">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm"
              style={{ background: `linear-gradient(135deg, ${BRAND}, #2a5a9e)` }}
            >
              <ShoppingCart size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Purchase</h1>
              <p className="text-sm text-gray-500">Vouchers, returns & expense entries</p>
            </div>
          </div>

          <div className="border-t border-gray-200 my-6" />

          {/* Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {OPTIONS.map((opt) => {
              const { title, description, href, Icon, accent, bg, primary } = opt;
              const disabled = !href;

              const inner = (
                <>
                  {/* left accent bar */}
                  <span
                    className="absolute left-0 top-0 h-full w-1"
                    style={{ background: disabled ? "#E5E7EB" : accent }}
                  />
                  <div
                    className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: disabled ? "#F3F4F6" : bg }}
                  >
                    <Icon size={22} className="" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-base font-semibold ${disabled ? "text-gray-400" : "text-gray-800 group-hover:text-[#1B3A6B]"} transition-colors`}>
                        {title}
                      </p>
                      {primary && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                          Ready
                        </span>
                      )}
                      {disabled && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                          Soon
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{description}</p>
                  </div>
                  {!disabled && (
                    <ChevronRight size={18} className="flex-shrink-0 text-gray-300 group-hover:text-[#1B3A6B] transition-colors" />
                  )}
                </>
              );

              const baseClass =
                "group relative overflow-hidden flex items-center gap-4 bg-white rounded-2xl pl-6 pr-5 py-4 border transition-all duration-150";

              return disabled ? (
                <div
                  key={title}
                  className={`${baseClass} border-gray-100 opacity-70 cursor-not-allowed`}
                  style={{ color: accent }}
                >
                  <span style={{ color: "#9CA3AF" }} className="contents">{inner}</span>
                </div>
              ) : (
                <Link
                  key={title}
                  href={href}
                  className={`${baseClass} border-gray-100 hover:border-[#1B3A6B]/30 hover:shadow-md cursor-pointer`}
                  style={{ color: accent }}
                >
                  {inner}
                </Link>
              );
            })}
          </div>

          <p className="text-center text-xs text-gray-400 mt-8">
            Cash Purchase Voucher is active — the other modules are being prepared.
          </p>
        </div>
      </main>
    </div>
  );
}
