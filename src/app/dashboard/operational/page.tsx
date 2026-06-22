"use client";

import Image from "next/image";
import Link from "next/link";
import {
  TrendingUp,
  ShoppingCart,
  Boxes,
  LogOut,
} from "lucide-react";
import CompanySelector from "@/components/company-selector";

const BRAND = "#1B3A6B";

type Tile = {
  title: string;
  description: string;
  href: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
};

const MODULES: Tile[] = [
  {
    title: "Sales",
    description: "Invoices, customers, revenue",
    href: "/dashboard/sales",
    Icon: TrendingUp,
  },
  {
    title: "Purchase",
    description: "Vendors, bills, procurement",
    href: "/dashboard/purchase",
    Icon: ShoppingCart,
  },
  {
    title: "Inventory",
    description: "Stock, warehouses, movements",
    href: "/dashboard/inventory",
    Icon: Boxes,
  },
];

function ModuleCard({ tile, delay }: { tile: Tile; delay: number }) {
  const { title, description, href, Icon } = tile;
  return (
    <Link
      href={href}
      className="tile group relative overflow-hidden rounded-3xl bg-white p-8 transition-all duration-300 hover:-translate-y-2"
      style={{
        animationDelay: `${delay}ms`,
        boxShadow:
          "0 20px 50px -10px rgba(0,0,0,0.35), 0 8px 20px -5px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow =
          "0 30px 70px -10px rgba(15,37,71,0.45), 0 14px 30px -8px rgba(27,58,107,0.3), 0 4px 10px rgba(0,0,0,0.1)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow =
          "0 20px 50px -10px rgba(0,0,0,0.35), 0 8px 20px -5px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)";
      }}
    >
      {/* Accent ribbon */}
      <div
        className="absolute top-0 left-0 h-1.5 w-full"
        style={{ background: `linear-gradient(90deg, ${BRAND}, #2e86c1)` }}
      />

      {/* Soft corner glow */}
      <div
        className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background:
            "radial-gradient(circle, rgba(27,58,107,0.12), transparent 70%)",
        }}
      />

      <div className="flex items-start gap-5">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-white transition-all duration-300 group-hover:scale-110 group-hover:rotate-3"
          style={{
            background: `linear-gradient(135deg, ${BRAND}, #2a5a9e)`,
            boxShadow: `0 12px 28px ${BRAND}55, inset 0 1px 0 rgba(255,255,255,0.2)`,
          }}
        >
          <Icon size={30} />
        </div>

        <div className="flex flex-col pt-1">
          <h2
            className="text-xl font-bold tracking-tight"
            style={{ color: BRAND }}
          >
            {title}
          </h2>
          <p className="mt-1.5 text-[13px] text-gray-500 leading-relaxed">
            {description}
          </p>
        </div>
      </div>

      <div className="mt-7 pt-5 border-t border-gray-100 flex items-center justify-end">
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white text-base transition-all duration-300 group-hover:translate-x-1 group-hover:shadow-lg"
          style={{ background: BRAND, boxShadow: `0 4px 12px ${BRAND}55` }}
          aria-hidden
        >
          →
        </span>
      </div>
    </Link>
  );
}

export default function OperationalPage() {
  return (
    <>
      <style>{`
        @keyframes gradientShift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes floatA {
          0%, 100% { transform: translateY(0px) scale(1); }
          50%       { transform: translateY(-30px) scale(1.05); }
        }
        @keyframes floatB {
          0%, 100% { transform: translateY(0px) scale(1); }
          50%       { transform: translateY(25px) scale(0.97); }
        }
        @keyframes tileIn {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animated-bg {
          background: linear-gradient(135deg, #0f2547, #1B3A6B, #1a5276, #0d3b6e, #163f6b);
          background-size: 400% 400%;
          animation: gradientShift 12s ease infinite;
        }
        .blob-a { animation: floatA 8s ease-in-out infinite; }
        .blob-b { animation: floatB 11s ease-in-out infinite; }
        .tile {
          animation: tileIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
      `}</style>

      <div className="animated-bg min-h-screen relative overflow-hidden">
        {/* Decorative blobs */}
        <div
          className="blob-a absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-20 pointer-events-none"
          style={{ background: "radial-gradient(circle, #4a9eda, transparent)" }}
        />
        <div
          className="blob-b absolute -bottom-32 -right-20 w-[28rem] h-[28rem] rounded-full opacity-15 pointer-events-none"
          style={{ background: "radial-gradient(circle, #2e86c1, transparent)" }}
        />

        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-5 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Top bar */}
        <header className="relative z-20 flex items-center justify-between px-6 md:px-10 py-5 gap-4">
          <div
            className="flex items-center bg-white rounded-2xl px-6 py-3 flex-shrink-0"
            style={{ boxShadow: "0 12px 30px -8px rgba(0,0,0,0.35), 0 4px 10px rgba(0,0,0,0.15)" }}
          >
            <Image src="/logo.png" alt="Diamond Star Arabia" width={220} height={72} priority
              className="object-contain h-16 w-auto" />
          </div>

          <div className="flex-1 flex justify-center">
            <CompanySelector />
          </div>

          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm font-medium px-4 py-2 backdrop-blur-md border border-white/15 transition-colors flex-shrink-0"
          >
            <LogOut size={16} />
            Log out
          </Link>
        </header>

        {/* Title */}
        <section className="relative z-10 px-6 md:px-10 pt-6 pb-10 text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
            Operational
          </h1>
          <div
            className="mx-auto mt-3 h-[3px] w-16 rounded-full"
            style={{ background: "#ffffff" }}
          />
        </section>

        <main className="relative z-10 px-6 md:px-12 lg:px-16 pb-20">
          <div className="mx-auto max-w-7xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10">
            {MODULES.map((tile, i) => (
              <ModuleCard key={tile.title} tile={tile} delay={i * 70} />
            ))}
          </div>
        </main>
      </div>
    </>
  );
}
