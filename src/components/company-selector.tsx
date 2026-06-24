"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, ChevronDown, Check } from "lucide-react";

export const COMPANIES = [
  { id: "namma",             name: "NAMMA AL ENJAZ FACTORY FOR INDUSTRY COMPANY" },
  { id: "alyaqeen",          name: "شركة اليقين المتقدمة التجارية" },
  { id: "diamond-star",      name: "DIAMOND STAR ARABIA INDUSTRIAL COMPANY" },
  { id: "madina",            name: "شركة مدينه الأخضر الدولي للتجارة" },
  { id: "owners-ac",         name: "OWNER'S A/C" },
  { id: "salon-ajwad",       name: "SALON AJWAD ALMASIA FOR MENS" },
  { id: "diamond-recycling", name: "Diamond Star for Waste Recycling Company" },
  { id: "abu-rayhan",        name: "ABU RAYHAN PERFUME FACT" },
  { id: "tadwir",            name: "شركة تدوير الجزيرة للتجارة – Tadwir Al Jazirah Trading Company LLC" },
];

const TOTAL      = COMPANIES.length;
const DEFAULT_ID = "diamond-star";
const isArabic   = (s: string) => /[؀-ۿ]/.test(s);

const STYLES = `
  @keyframes csFlicker {
    0%{opacity:0}8%{opacity:.7}20%{opacity:.08}34%{opacity:.5}
    48%{opacity:.04}62%{opacity:.3}78%{opacity:.02}100%{opacity:0}
  }
  @keyframes dropIn {
    from{opacity:0;transform:translateY(-8px) scale(.97)}
    to{opacity:1;transform:translateY(0) scale(1)}
  }
`;

interface Props {
  single?: boolean;
}

export default function CompanySelector({ single = false }: Props) {
  const [ids, setIds]        = useState<string[]>([DEFAULT_ID]);
  const [open, setOpen]      = useState(false);
  const [flashing, setFlash] = useState(false);
  const ref                  = useRef<HTMLDivElement>(null);

  // Load from localStorage
  useEffect(() => {
    try {
      if (single) {
        const s = localStorage.getItem("active_company");
        setIds(s ? [s] : [DEFAULT_ID]);
      } else {
        const s = localStorage.getItem("selected_companies");
        if (s) {
          const parsed: string[] = JSON.parse(s);
          setIds(parsed.length > 0 ? parsed : [DEFAULT_ID]);
        }
      }
    } catch {}
  }, [single]);

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  function flash() {
    setFlash(true);
    setTimeout(() => setFlash(false), 750);
  }

  function save(next: string[]) {
    const guarded = next.length === 0 ? [DEFAULT_ID] : next;
    setIds(guarded);
    if (single) {
      localStorage.setItem("active_company", guarded[0]);
    } else {
      localStorage.setItem("selected_companies", JSON.stringify(guarded));
    }
    window.dispatchEvent(new CustomEvent("companiesChanged", { detail: guarded }));
  }

  function pick(id: string) {
    save([id]);
    setOpen(false);
    flash();
  }

  function toggle(id: string) {
    if (ids.includes(id) && ids.length === 1) return;
    save(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
    flash();
  }

  function toggleAll() {
    if (ids.length === TOTAL) return;
    save(COMPANIES.map((c) => c.id));
    flash();
  }

  const allSelected = ids.length === TOTAL;
  const label =
    ids.length === 0   ? "Select Company"
    : ids.length === 1 ? (COMPANIES.find((c) => c.id === ids[0])?.name ?? "")
    : allSelected      ? `All Companies (${TOTAL})`
    : `${ids.length} Companies`;

  return (
    <div className="relative" ref={ref}>
      <style>{STYLES}</style>

      {flashing && (
        <div className="fixed inset-0 pointer-events-none"
          style={{ zIndex: 9999, background: "linear-gradient(135deg,rgba(74,158,218,.85),rgba(27,58,107,.9))", animation: "csFlicker .75s ease-out forwards" }} />
      )}

      {/* Trigger */}
      <button onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-xl px-4 py-2 transition-all duration-200"
        style={{
          background: open ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.10)",
          border: "1px solid rgba(255,255,255,.18)",
          backdropFilter: "blur(10px)",
          minWidth: "220px", maxWidth: "320px",
        }}>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg flex-shrink-0"
          style={{ background: "rgba(74,158,218,.25)" }}>
          <Building2 size={14} className="text-[#7dd3fc]" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[9px] uppercase tracking-[.12em] text-white/40 font-bold leading-none mb-0.5">
            {single ? "Entering for" : "Company"}
          </p>
          <p className="text-[12px] font-semibold text-white truncate leading-tight">{label}</p>
        </div>
        {!single && ids.length > 1 && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
            style={{ background: "rgba(74,158,218,.3)", color: "#7dd3fc" }}>
            {ids.length}
          </span>
        )}
        <ChevronDown size={13} className={`text-white/50 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full mt-2 left-0 z-50 rounded-2xl overflow-hidden w-[360px]"
          style={{
            background: "rgba(8,20,48,.97)",
            border: "1px solid rgba(255,255,255,.10)",
            backdropFilter: "blur(24px)",
            boxShadow: "0 24px 60px rgba(0,0,0,.55)",
            animation: "dropIn .18s cubic-bezier(.22,1,.36,1) both",
          }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5"
            style={{ borderBottom: "1px solid rgba(255,255,255,.07)" }}>
            <div className="flex items-center gap-2">
              <Building2 size={12} className="text-white/30" />
              <span className="text-[10px] uppercase tracking-[.15em] text-white/30 font-bold">
                {single ? "Select One Company" : "Select Company"}
              </span>
            </div>
            {!single && <span className="text-[10px] text-white/25">{ids.length} / {TOTAL}</span>}
          </div>

          {/* Select All — multi only */}
          {!single && (
            <button onClick={toggleAll} disabled={allSelected}
              className="w-full flex items-center gap-3 px-4 py-3 transition-all"
              style={{ borderBottom: "1px solid rgba(255,255,255,.06)", opacity: allSelected ? .5 : 1, cursor: allSelected ? "default" : "pointer" }}
              onMouseEnter={(e) => { if (!allSelected) e.currentTarget.style.background = "rgba(74,158,218,.10)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
              <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md"
                style={{ border: `2px solid ${allSelected ? "#4a9eda" : "rgba(255,255,255,.2)"}`, background: allSelected ? "#4a9eda" : "transparent" }}>
                {allSelected ? <Check size={11} className="text-white" strokeWidth={3} /> : <div className="w-2 h-0.5 rounded-full bg-white/30" />}
              </div>
              <span className="text-sm font-bold" style={{ color: allSelected ? "#7dd3fc" : "rgba(255,255,255,.75)" }}>
                {allSelected ? "All Companies Selected" : "Select All Companies"}
              </span>
            </button>
          )}

          {/* List */}
          <ul className="py-1 max-h-64 overflow-y-auto"
            style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,.1) transparent" }}>
            {COMPANIES.map((co, idx) => {
              const active = ids.includes(co.id);
              return (
                <li key={co.id}>
                  <button
                    onClick={() => single ? pick(co.id) : toggle(co.id)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 transition-all"
                    style={{ background: active ? "rgba(74,158,218,.08)" : "transparent" }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,.04)"; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}>
                    {single ? (
                      <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full"
                        style={{ border: `2px solid ${active ? "#4a9eda" : "rgba(255,255,255,.16)"}` }}>
                        {active && <div className="w-2.5 h-2.5 rounded-full bg-[#4a9eda]" />}
                      </div>
                    ) : (
                      <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md"
                        style={{ border: `2px solid ${active ? "#4a9eda" : "rgba(255,255,255,.16)"}`, background: active ? "#4a9eda" : "transparent" }}>
                        {active && <Check size={11} className="text-white" strokeWidth={3} />}
                      </div>
                    )}
                    <span className="text-[10px] font-mono text-white/20 w-4 flex-shrink-0">{idx + 1}</span>
                    <span className="text-[12px] flex-1 text-left leading-snug"
                      style={{ color: active ? "#e0f2fe" : "rgba(255,255,255,.55)", fontWeight: active ? 600 : 400, direction: isArabic(co.name) ? "rtl" : "ltr" }}>
                      {co.name}
                    </span>
                    {active && <div className="w-1.5 h-1.5 rounded-full bg-[#4a9eda] flex-shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Footer */}
          <div className="flex items-center justify-end px-4 py-2"
            style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
            {!single && (
              <button onClick={() => save([])} className="text-[10px] text-white/25 hover:text-white/50 transition-colors mr-auto">
                Clear all
              </button>
            )}
            <button onClick={() => setOpen(false)}
              className="text-[10px] font-semibold px-3 py-1 rounded-full"
              style={{ background: "rgba(74,158,218,.2)", color: "#7dd3fc" }}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
