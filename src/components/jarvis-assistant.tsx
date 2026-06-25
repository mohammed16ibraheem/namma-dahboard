"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";

/* ── types ─────────────────────────────────────────────────────────────── */
interface JarvisData {
  company:      string;
  period:       string;
  revenue:      number;
  grossProfit:  number;
  netProfit:    number;
  gpMargin:     number;
  netMargin:    number;
  totalAssets:  number;
  totalEquity:  number;
  totalLiab:    number;
  cashBs:       number;
  operatingCF:  number;
  investingCF:  number;
  financingCF:  number;
  currentRatio: number;
  debtToEquity: number;
  taxTotal:     number;
  onExport?:    () => void;
}

/* ── voice config ────────────────────────────────────────────────────────  */
const VOICE_NAME  = "Google UK English Female";
const VOICE_LANG  = "en-GB";
const VOICE_RATE  = 1.0;
const VOICE_PITCH = 0.98;

/* ── formatters ──────────────────────────────────────────────────────────  */
const sar = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "negative " : "";
  if (a >= 1e9) return s + (a / 1e9).toFixed(2) + " billion SAR";
  if (a >= 1e6) return s + (a / 1e6).toFixed(2) + " million SAR";
  if (a >= 1e3) return s + (a / 1e3).toFixed(1) + " thousand SAR";
  return s + a.toFixed(0) + " SAR";
};
const pct = (n: number) => Math.abs(n).toFixed(1) + " percent";

/* ── greeting ────────────────────────────────────────────────────────────  */
function timeGreet() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning, sir.";
  if (h < 17) return "Good afternoon, sir.";
  return "Good evening, sir.";
}

/* ── opening briefing ────────────────────────────────────────────────────  */
function openingBriefing(d: JarvisData): string {
  return `${timeGreet()} Financial briefing for ${d.company.toUpperCase()}. I am ready for your questions, sir.`;
}

/* ── JARVIS brain ─────────────────────────────────────────────────────────
   Questions are modelled on what a CEO / finance manager actually asks when
   looking at this dashboard.  Every answer is driven by the live d values.
── */
function jarvisReply(input: string, d: JarvisData): { text: string; farewell: boolean } {
  const q = input.toLowerCase();
  const say = (text: string) => ({ text, farewell: false });

  /* ── farewell ── */
  if (/thank|thanks|bye|goodbye|that.s all|that is all|dismiss|close/.test(q))
    return { text: "Of course, sir. I remain on standby.", farewell: true };

  /* ── greeting ── */
  if (/\b(hello|hi|hey)\b/.test(q))
    return say(`${timeGreet()} What would you like to know about ${d.company}?`);

  /* ── CONCERN / RISK — "should I be worried?", "any red flags?", "any issues?" ── */
  if (/worried|concern|risk|red flag|issue|problem|warn|alert|danger|bad/.test(q)) {
    const flags: string[] = [];
    if (d.netProfit < 0)        flags.push(`net loss of ${sar(Math.abs(d.netProfit))}`);
    if (d.operatingCF < 0)      flags.push(`negative operating cash flow of ${sar(Math.abs(d.operatingCF))}`);
    if (d.currentRatio < 1)     flags.push(`current ratio below one at ${d.currentRatio.toFixed(2)}`);
    if (d.gpMargin < 15)        flags.push(`very low gross margin of ${pct(d.gpMargin)}`);
    if (d.debtToEquity > 2)     flags.push(`high debt-to-equity of ${d.debtToEquity.toFixed(2)}`);
    if (d.cashBs < 0)           flags.push("negative cash balance on the balance sheet");
    if (flags.length === 0)
      return say(`No red flags detected for ${d.period}. All key indicators — profitability, liquidity, and cash flow — are within healthy ranges. You may proceed with confidence, sir.`);
    return say(`I have identified ${flags.length} concern${flags.length > 1 ? "s" : ""} requiring your attention: ${flags.join("; ")}. I recommend an immediate review of these items.`);
  }

  /* ── OVERALL HEALTH — "how are we doing?", "give me an update" ── */
  if (/how are we|how.s (the )?company|overall|update|health|performance|doing|going/.test(q)) {
    const score = [d.netProfit > 0, d.operatingCF > 0, d.currentRatio >= 1, d.gpMargin >= 20, d.debtToEquity <= 2].filter(Boolean).length;
    const grade = score >= 5 ? "excellent" : score >= 3 ? "stable" : "under pressure";
    return say(`${d.company} is ${grade} for the period ending ${d.period}. ` +
      `Revenue is ${sar(d.revenue)} with a net margin of ${pct(d.netMargin)}. ` +
      `Operating cash flow is ${sar(d.operatingCF)} and current ratio stands at ${d.currentRatio.toFixed(2)}. ` +
      (score >= 4 ? "The fundamentals are solid, sir." : score >= 3 ? "There are areas worth monitoring." : "I recommend a detailed review of costs and cash position."));
  }

  /* ── REVENUE / SALES ── */
  if (/revenue|sales|turnover|income|top.?line/.test(q))
    return say(`Revenue for ${d.period} is ${sar(d.revenue)}. ` +
      `After cost of goods sold, gross profit is ${sar(d.grossProfit)} — a gross margin of ${pct(d.gpMargin)}. ` +
      (d.gpMargin >= 35 ? "Margins are strong." : d.gpMargin >= 20 ? "Margins are acceptable." : "Margins are thin — cost of goods sold should be reviewed."));

  /* ── PROFITABILITY — "are we making money?", "profit?" ── */
  if (/profit|making money|bottom.?line|net income|earning/.test(q)) {
    if (d.netProfit > 0)
      return say(`The company is profitable. Net profit after tax is ${sar(d.netProfit)}, a net margin of ${pct(d.netMargin)}. ` +
        (d.netMargin >= 15 ? "That is a very healthy margin, sir." : d.netMargin >= 8 ? "Margin is reasonable." : "Margin is slim — watch operating expenses closely."));
    return say(`The company is currently at a loss. Net loss is ${sar(Math.abs(d.netProfit))}. ` +
      `Gross profit of ${sar(d.grossProfit)} is being consumed by operating and overhead costs. Immediate cost review is advised.`);
  }

  /* ── GROSS MARGIN / COST OF GOODS ── */
  if (/gross (margin|profit)|cost of (goods|sales)|cogs/.test(q))
    return say(`Gross profit is ${sar(d.grossProfit)}, representing a gross margin of ${pct(d.gpMargin)}. ` +
      (d.gpMargin >= 35 ? "This is excellent — the company retains a strong share of every riyal earned." :
       d.gpMargin >= 20 ? "This is healthy, though there may be room to negotiate better input costs." :
       "This is below the 20% threshold. The cost of goods sold is too high relative to revenue — pricing or procurement needs attention."));

  /* ── CASH POSITION ── */
  if (/cash position|how much cash|cash on hand|available cash/.test(q))
    return say(`Cash and equivalents on the balance sheet total ${sar(d.cashBs)}. ` +
      `Operating activities generated ${sar(d.operatingCF)} in cash this period. ` +
      (d.operatingCF > 0 && d.cashBs > 0 ? "The business is self-funding — a positive sign." :
       d.cashBs < 0 ? "The cash balance is negative, which is a liquidity concern." :
       "Cash is adequate but the operating trend should be watched closely."));

  /* ── CASH FLOW ── */
  if (/cash.?flow|operating.?cash|investing|financing/.test(q))
    return say(`Cash flow breakdown for ${d.period}: ` +
      `Operating ${sar(d.operatingCF)}, Investing ${sar(d.investingCF)}, Financing ${sar(d.financingCF)}. ` +
      (d.operatingCF > 0 ? "Core operations are cash-generative. " : "Operations are consuming cash — review working capital. ") +
      (d.investingCF < 0 ? "Investment outflows suggest active capital expenditure." : "Minimal investing activity this period."));

  /* ── LIQUIDITY — "can we pay our bills?", "short term obligations" ── */
  if (/liquid|pay.*(bill|debt|obligation)|short.?term|current ratio|can we pay/.test(q))
    return say(`Liquidity check: current ratio is ${d.currentRatio.toFixed(2)} and cash stands at ${sar(d.cashBs)}. ` +
      (d.currentRatio >= 2 ? "The company can comfortably meet all short-term obligations, sir." :
       d.currentRatio >= 1.2 ? "Short-term obligations are covered, with a reasonable buffer." :
       d.currentRatio >= 1 ? "Current assets just cover current liabilities — the buffer is thin." :
       "Current ratio is below 1.0. The company may struggle to meet short-term obligations. This needs urgent attention."));

  /* ── BALANCE SHEET / ASSETS ── */
  if (/balance.?sheet|total asset|asset|net worth/.test(q))
    return say(`Balance sheet as at ${d.period}: Total assets ${sar(d.totalAssets)}, Total liabilities ${sar(d.totalLiab)}, Equity ${sar(d.totalEquity)}. ` +
      `Asset-to-equity ratio implies ${d.debtToEquity <= 1 ? "a conservatively financed company." : d.debtToEquity <= 2 ? "moderate leverage." : "high reliance on debt financing."}`);

  /* ── DEBT / LIABILITIES ── */
  if (/debt|liabilit|borrow|owe|leverage/.test(q))
    return say(`Total liabilities are ${sar(d.totalLiab)} against equity of ${sar(d.totalEquity)}, giving a debt-to-equity ratio of ${d.debtToEquity.toFixed(2)}. ` +
      (d.debtToEquity <= 0.5 ? "The company is very lightly leveraged — conservative and low-risk." :
       d.debtToEquity <= 1.5 ? "Leverage is moderate and manageable." :
       d.debtToEquity <= 2.5 ? "Leverage is elevated. Monitor debt servicing capacity." :
       "Leverage is high. Debt reduction should be prioritised, sir."));

  /* ── EQUITY / SHAREHOLDERS ── */
  if (/equity|shareholder|owner|capital structure/.test(q))
    return say(`Shareholder equity stands at ${sar(d.totalEquity)}, funded by ${sar(d.totalAssets)} in total assets. ` +
      `Debt-to-equity is ${d.debtToEquity.toFixed(2)}. ` +
      (d.netProfit > 0 ? `Net profit of ${sar(d.netProfit)} is adding to retained earnings this period.` :
       `The current net loss is eroding the equity base — this trend must be reversed.`));

  /* ── TAX / ZAKAT / VAT ── */
  if (/tax|zakat|vat|withholding/.test(q)) {
    const effectiveTaxRate = d.revenue > 0 ? (d.taxTotal / d.revenue * 100) : 0;
    return say(`Total tax and zakat obligations for ${d.period} amount to ${sar(d.taxTotal)}. ` +
      `This represents an effective rate of ${effectiveTaxRate.toFixed(1)}% of revenue. ` +
      (d.taxTotal > 0 ? "All provisions are accounted for in the financial statements." : "No tax obligations are flagged for this period."));
  }

  /* ── WHAT SHOULD WE FOCUS ON / PRIORITIES ── */
  if (/focus|priorit|improve|action|recommend|next step|what should/.test(q)) {
    const actions: string[] = [];
    if (d.netProfit < 0)       actions.push("reduce operating costs to restore profitability");
    if (d.gpMargin < 20)       actions.push("renegotiate procurement to improve gross margin above 20%");
    if (d.operatingCF < 0)     actions.push("address working capital — collections or payables cycle");
    if (d.currentRatio < 1.2)  actions.push("strengthen short-term liquidity");
    if (d.debtToEquity > 2)    actions.push("reduce debt exposure");
    if (actions.length === 0)
      return say(`The company is performing well. Focus areas for continued growth: sustaining the ${pct(d.gpMargin)} gross margin, growing revenue while controlling fixed costs, and maintaining the ${d.currentRatio.toFixed(2)} current ratio.`);
    return say(`Based on the current dashboard, I recommend the following priorities: ${actions.map((a, i) => `${i + 1}. ${a}`).join("; ")}.`);
  }

  /* ── EXPENSES / COSTS ── */
  if (/expense|cost|overhead|opex|spending/.test(q)) {
    const opex = d.revenue - d.grossProfit;
    const opexRatio = d.revenue > 0 ? (opex / d.revenue * 100) : 0;
    return say(`Cost of goods sold consumes ${pct(100 - d.gpMargin)} of revenue, leaving a gross margin of ${pct(d.gpMargin)}. ` +
      `After gross profit of ${sar(d.grossProfit)}, operating and overhead expenses reduce this to a net profit of ${sar(d.netProfit)}. ` +
      (d.netMargin < d.gpMargin / 2 ? "The gap between gross and net margin is wide — overhead costs are significant." : "The cost structure appears balanced."));
  }

  /* ── RATIOS ── */
  if (/ratio|metric|kpi|indicator/.test(q))
    return say(`Key ratios for ${d.period}: Current ratio ${d.currentRatio.toFixed(2)} (${d.currentRatio >= 1.5 ? "healthy" : d.currentRatio >= 1 ? "adequate" : "critical"}), ` +
      `Debt-to-equity ${d.debtToEquity.toFixed(2)} (${d.debtToEquity <= 1 ? "conservative" : d.debtToEquity <= 2 ? "moderate" : "elevated"}), ` +
      `Gross margin ${pct(d.gpMargin)} (${d.gpMargin >= 35 ? "strong" : d.gpMargin >= 20 ? "acceptable" : "weak"}), ` +
      `Net margin ${pct(d.netMargin)} (${d.netMargin >= 15 ? "excellent" : d.netMargin >= 5 ? "fair" : d.netProfit >= 0 ? "thin" : "loss-making"}).`);

  /* ── SUMMARY ── */
  if (/summary|overview|brief|snapshot|tell me everything/.test(q))
    return say(`${d.company} — ${d.period} snapshot. ` +
      `Revenue ${sar(d.revenue)}, Gross profit ${sar(d.grossProfit)} at ${pct(d.gpMargin)} margin, ` +
      `Net ${d.netProfit >= 0 ? "profit" : "loss"} ${sar(Math.abs(d.netProfit))} at ${pct(Math.abs(d.netMargin))} margin. ` +
      `Cash ${sar(d.cashBs)}, Operating CF ${sar(d.operatingCF)}. ` +
      `Assets ${sar(d.totalAssets)}, Equity ${sar(d.totalEquity)}, D/E ${d.debtToEquity.toFixed(2)}. ` +
      (d.netProfit > 0 && d.operatingCF > 0 ? "All primary indicators are positive." : "Some indicators require attention."));

  /* ── EXPORT ── */
  if (/export|report|download|excel|file/.test(q)) {
    d.onExport?.();
    return say("Generating the full financial report now — five sheets, colour-coded. The file will download momentarily.");
  }

  /* ── HELP ── */
  if (/help|what can you|what do you know|capabilities/.test(q))
    return say("I can answer questions about revenue, profitability, cash flow, balance sheet, liquidity, debt, tax, key ratios, risks, and priorities. I can also export the full Excel report. Just ask naturally.");

  return say("I didn't catch that clearly. Try asking about revenue, profit, cash flow, risks, or say 'give me a summary'.");
}

/* ── SpeechRecognition shim ──────────────────────────────────────────────  */
interface ISpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: { [i: number]: { [i: number]: { transcript: string } } } }) => void) | null;
  onend:   (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  abort(): void;
}
type SRCtor = new () => ISpeechRecognition;

/* ── GLSL shaders (from rajtilak-2020/Audio-Controlled-Particles, colour-extended) ── */
const VERTEX_SHADER = `
  uniform float uTime;
  uniform float uAudioLow;
  uniform float uAudioMid;
  uniform float uAudioHigh;

  varying vec3  vColor;
  varying float vAudioMid;

  vec3 mod289v3(vec3 x) { return x - floor(x*(1.0/289.0))*289.0; }
  vec4 mod289v4(vec4 x) { return x - floor(x*(1.0/289.0))*289.0; }
  vec4 permute(vec4 x)  { return mod289v4(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314*r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g  = step(x0.yzx, x0.xyz);
    vec3 l  = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289v3(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0,i1.z,i2.z,1.0))
      + i.y + vec4(0.0,i1.y,i2.y,1.0))
      + i.x + vec4(0.0,i1.x,i2.x,1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0*floor(p*ns.z*ns.z);
    vec4 x_ = floor(j*ns.z);
    vec4 y_ = floor(j - 7.0*x_);
    vec4 x = x_*ns.x + ns.yyyy;
    vec4 y = y_*ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0+1.0;
    vec4 s1 = floor(b1)*2.0+1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)), 0.0);
    m = m*m;
    return 42.0*dot(m*m, vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }

  vec3 snoiseVec3(vec3 x) {
    return vec3(
      snoise(vec3(x)),
      snoise(vec3(x.y-19.1, x.z+33.4, x.x+47.2)),
      snoise(vec3(x.z+74.2, x.x-124.5, x.y+99.4))
    );
  }

  vec3 curlNoise(vec3 p) {
    const float e = .1;
    vec3 dx=vec3(e,0,0), dy=vec3(0,e,0), dz=vec3(0,0,e);
    vec3 px0=snoiseVec3(p-dx), px1=snoiseVec3(p+dx);
    vec3 py0=snoiseVec3(p-dy), py1=snoiseVec3(p+dy);
    vec3 pz0=snoiseVec3(p-dz), pz1=snoiseVec3(p+dz);
    return normalize(vec3(
      py1.z-py0.z - pz1.y+pz0.y,
      pz1.x-pz0.x - px1.z+px0.z,
      px1.y-px0.y - py1.x+py0.x
    ));
  }

  void main() {
    vec3  curl  = curlNoise(position*0.5 + uTime*0.1);
    float noise = snoise(position*0.5 + uTime*0.2);
    float chaos = (uAudioLow + uAudioMid + uAudioHigh)*0.7;

    vec3 rnd = vec3(
      snoise(position + vec3(uTime*2.0, 0.0, 0.0)),
      snoise(position + vec3(0.0, uTime*2.0, 0.0)),
      snoise(position + vec3(0.0, 0.0, uTime*2.0))
    );

    vec3 base      = position*(1.0 + uAudioLow*0.5);
    vec3 ordered   = curl*(0.3 + uAudioMid*0.20) + normal*(noise*0.42);
    vec3 chaotic   = rnd*chaos*2.0;
    vec3 displaced = base + mix(ordered, chaotic, chaos*0.7);
    displaced += curl*sin(uTime*10.0)*uAudioHigh*0.2;

    /* original multicolour from the repo — time + curl driven */
    vec3 baseColor = vec3(
      0.5 + 0.5*sin(curl.y + 2.0),
      0.5 + 0.5*sin(uTime*1.0 + curl.y),
      0.5 + 0.5*sin(uTime*0.1 + curl.z + 4.0)
    );
    vec3 lowColor  = vec3(0.1, 0.4, 1.0);
    vec3 midColor  = vec3(1.0, 0.4, 0.1);
    vec3 highColor = vec3(1.0, 0.1, 0.4);
    vColor  = baseColor;
    vColor  = mix(vColor, lowColor,  uAudioLow  * 0.057);
    vColor  = mix(vColor, midColor,  uAudioMid  * 0.057);
    vColor  = mix(vColor, highColor, uAudioHigh * 0.057);
    vAudioMid = uAudioMid;

    vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
    gl_Position = projectionMatrix * mv;

    float sz = 3.5 + uAudioLow*1.0 + uAudioMid*4.5;
    sz *= (1.0 + uAudioHigh);
    gl_PointSize = sz*(1.0/-mv.z);
  }
`;

const FRAGMENT_SHADER = `
  varying vec3  vColor;
  varying float vAudioMid;
  void main() {
    vec2  c    = gl_PointCoord - vec2(0.5);
    float dist = length(c);
    if (dist > 0.5) discard;
    float alpha = 1.0 - smoothstep(0.45 + vAudioMid*0.1, 0.5, dist);
    float glow  = 1.0 - smoothstep(0.0, 0.35, dist);
    gl_FragColor = vec4(mix(vColor, vColor*0.5, glow*vAudioMid), alpha);
  }
`;


/* ══════════════════════════════════════════════════════════════════════════ */
export default function JarvisAssistant({ data }: { data: JarvisData }) {
  const [open,       setOpen]       = useState(false);
  const [phase,      setPhase]      = useState<"idle" | "speaking" | "listening" | "processing">("idle");
  const [transcript, setTranscript] = useState("");
  const [response,   setResponse]   = useState("");

  const synthRef     = useRef<SpeechSynthesis | null>(null);
  const voiceRef     = useRef<SpeechSynthesisVoice | null>(null);
  const recognRef    = useRef<ISpeechRecognition | null>(null);
  const openRef      = useRef(false);
  const dataRef      = useRef(data);
  dataRef.current    = data;
  const containerRef  = useRef<HTMLDivElement>(null);
  const phaseRef      = useRef<"idle"|"speaking"|"listening"|"processing">("idle");
  const analyserRef   = useRef<AnalyserNode | null>(null);
  const audioDataRef  = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const audioCtxRef   = useRef<AudioContext | null>(null);
  const micStreamRef  = useRef<MediaStream | null>(null);

  /* ── find voice ─────────────────────────────────────────────────────── */
  const findVoice = useCallback(() => {
    const voices = synthRef.current?.getVoices() ?? [];
    voiceRef.current =
      voices.find(v => v.name === VOICE_NAME) ??
      voices.find(v => v.name.toLowerCase().includes("uk english female")) ??
      voices.find(v => v.lang === VOICE_LANG && v.name.toLowerCase().includes("female")) ??
      voices.find(v => v.lang === VOICE_LANG) ??
      voices.find(v => v.lang.startsWith("en-GB")) ??
      voices.find(v => v.lang.startsWith("en")) ??
      null;
  }, []);

  /* ── Three.js audio-reactive particle sphere ────────────────────────────
     Depends on [open]: runs when panel mounts (open=true), cleans up on close.
     Real mic FFT data drives particles when user is speaking (listening phase).
  ── */
  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;

    const W = container.clientWidth  || 360;
    const H = 260;

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 5000);
    camera.position.z = 1;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 1);
    renderer.domElement.style.display = "block";
    container.appendChild(renderer.domElement);

    /* geometry — 45 k particles */
    const COUNT = 45000;
    const pos: number[] = [];
    for (let i = 0; i < COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = Math.cbrt(Math.random()) * 2;
      pos.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi),
      );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute("normal",   new THREE.Float32BufferAttribute(pos, 3));

    const uniforms = {
      uTime:      { value: 0 },
      uAudioLow:  { value: 0.04 },
      uAudioMid:  { value: 0.02 },
      uAudioHigh: { value: 0.01 },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader:   VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite:  false,
    });
    scene.add(new THREE.Points(geometry, material));

    let curLow = 0.04, curMid = 0.02, curHigh = 0.01;

    /* helper: average a frequency range from the mic data array */
    function freqAvg(data: Uint8Array<ArrayBuffer>, start: number, end: number) {
      let sum = 0;
      for (let i = start; i < end; i++) sum += data[i];
      return (sum / (end - start) / 255) * 0.7;
    }

    let rafId = 0;
    function draw() {
      rafId = requestAnimationFrame(draw);
      const t = performance.now() * 0.001;
      uniforms.uTime.value = t;

      const ph = phaseRef.current;

      let tLow: number, tMid: number, tHigh: number;

      /* listening phase: use REAL mic FFT data scaled down for calm movement */
      if (ph === "listening" && analyserRef.current && audioDataRef.current) {
        analyserRef.current.getByteFrequencyData(audioDataRef.current as Uint8Array<ArrayBuffer>);
        const d = audioDataRef.current as Uint8Array<ArrayBuffer>;
        /* scale real mic data to 30% so particles flow gently, not explode */
        tLow  = freqAvg(d,  0,  20) * 0.30;
        tMid  = freqAvg(d, 20,  50) * 0.30;
        tHigh = freqAvg(d, 50, 100) * 0.30;
      } else if (ph === "listening") {
        /* mic not yet granted — slow breathing pulse */
        tLow  = 0.06 + 0.04 * Math.abs(Math.sin(t * 0.9));
        tMid  = 0.05 + 0.03 * Math.abs(Math.sin(t * 1.1));
        tHigh = 0.03 + 0.02 * Math.abs(Math.sin(t * 1.3));
      } else if (ph === "speaking") {
        /* gentle slow swell — JARVIS voice, not explosive */
        tLow  = 0.07 + 0.05 * Math.abs(Math.sin(t * 0.8));
        tMid  = 0.06 + 0.04 * Math.abs(Math.sin(t * 1.0));
        tHigh = 0.03 + 0.02 * Math.abs(Math.sin(t * 1.2));
      } else if (ph === "processing") {
        tLow  = 0.05 + 0.03 * Math.abs(Math.sin(t * 0.7));
        tMid  = 0.07 + 0.04 * Math.abs(Math.sin(t * 0.9));
        tHigh = 0.03 + 0.02 * Math.abs(Math.sin(t * 1.1));
      } else {
        tLow  = 0.03 + 0.01 * Math.abs(Math.sin(t * 0.5));
        tMid  = 0.02 + 0.008 * Math.abs(Math.sin(t * 0.6));
        tHigh = 0.01 + 0.005 * Math.abs(Math.sin(t * 0.7));
      }

      /* slow lerp = smooth, gradual transitions */
      curLow  += (tLow  - curLow)  * 0.04;
      curMid  += (tMid  - curMid)  * 0.04;
      curHigh += (tHigh - curHigh) * 0.04;

      uniforms.uAudioLow.value  = curLow;
      uniforms.uAudioMid.value  = curMid;
      uniforms.uAudioHigh.value = curHigh;

      renderer.render(scene, camera);
    }
    draw();

    return () => {
      cancelAnimationFrame(rafId);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [open]);

  /* keep phaseRef in sync so the RAF loop reads current phase */
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  /* ── mic audio capture for real voice-reactive particles ──────────────── */
  useEffect(() => {
    if (phase !== "listening") {
      /* stop mic when not listening */
      analyserRef.current  = null;
      audioDataRef.current = null;
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current  = null;
      micStreamRef.current?.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
      return;
    }

    let cancelled = false;
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        micStreamRef.current = stream;
        const ctx      = new AudioContext();
        audioCtxRef.current = ctx;
        const source   = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        analyserRef.current  = analyser;
        audioDataRef.current = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
      })
      .catch(() => { /* mic permission denied — simulated fallback is used */ });

    return () => { cancelled = true; };
  }, [phase]);

  /* ── speak → then auto-listen ────────────────────────────────────────── */
  const speak = useCallback((text: string, autoListen = true) => {
    synthRef.current?.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    if (voiceRef.current) utter.voice = voiceRef.current;
    utter.lang   = VOICE_LANG;
    utter.rate   = VOICE_RATE;
    utter.pitch  = VOICE_PITCH;
    utter.volume = 1.0;
    utter.onstart = () => setPhase("speaking");
    utter.onend   = () => {
      if (!openRef.current) return;
      if (autoListen && recognRef.current) {
        setTimeout(() => {
          if (!openRef.current) return;
          setPhase("listening");
          try { recognRef.current!.start(); } catch { /* already active */ }
        }, 600);
      } else {
        setPhase("idle");
      }
    };
    utter.onerror = () => setPhase("idle");
    synthRef.current?.speak(utter);
  }, []);

  /* ── handle user speech ──────────────────────────────────────────────── */
  const handleInput = useCallback((text: string) => {
    setPhase("processing");
    const { text: reply, farewell } = jarvisReply(text, dataRef.current);
    setResponse(reply);
    speak(reply, !farewell);
  }, [speak]);

  /* ── init once ───────────────────────────────────────────────────────── */
  useEffect(() => {
    synthRef.current = window.speechSynthesis;
    synthRef.current.onvoiceschanged = findVoice;
    findVoice();
    setTimeout(findVoice, 400);

    const win   = window as unknown as Record<string, unknown>;
    const SRCls = (win.SpeechRecognition ?? win.webkitSpeechRecognition) as SRCtor | undefined;
    if (SRCls) {
      const r = new SRCls();
      r.lang           = "en-US";
      r.continuous     = false;
      r.interimResults = false;
      r.onresult = (e) => {
        const text = e.results[0][0].transcript;
        setTranscript(text);
        handleInput(text);
      };
      r.onend   = () => { if (openRef.current) setPhase(p => p === "listening" ? "idle" : p); };
      r.onerror = () => { setPhase("idle"); };
      recognRef.current = r;
    }

    return () => {
      synthRef.current?.cancel();
      recognRef.current?.abort();
      analyserRef.current  = null;
      audioDataRef.current = null;
      audioCtxRef.current?.close().catch(() => {});
      micStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [findVoice, handleInput]);

  /* ── Ctrl+D keyboard shortcut ───────────────────────────────────────── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        toggleOpenRef.current?.();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  /* ── open / close ────────────────────────────────────────────────────── */
  const toggleOpenRef = useRef<(() => void) | null>(null);
  const toggleOpen = () => {
    if (!open) {
      openRef.current = true;
      setOpen(true);
      setTranscript("");
      setPhase("speaking");
      const intro = openingBriefing(dataRef.current);
      setResponse(intro);
      setTimeout(() => speak(intro, true), 350);
    } else {
      openRef.current = false;
      synthRef.current?.cancel();
      recognRef.current?.abort();
      setOpen(false);
      setPhase("idle");
    }
  };

  toggleOpenRef.current = toggleOpen;

  /* ── manual mic toggle ───────────────────────────────────────────────── */
  const toggleMic = () => {
    if (!recognRef.current) return;
    if (phase === "listening") {
      recognRef.current.abort();
      setPhase("idle");
    } else {
      synthRef.current?.cancel();
      setTranscript("");
      setPhase("listening");
      try { recognRef.current.start(); } catch { /* already active */ }
    }
  };

  /* ── derived UI ──────────────────────────────────────────────────────── */
  const statusLabel =
    phase === "speaking"   ? "JARVIS SPEAKING..." :
    phase === "listening"  ? "LISTENING — SPEAK NOW" :
    phase === "processing" ? "PROCESSING..." :
                             "CLICK MIC TO SPEAK";

  const statusColor =
    phase === "listening"  ? "#00ff88" :
    phase === "speaking"   ? "#00d4ff" :
    phase === "processing" ? "#fbbf24" :
                             "#00d4ff55";

  return (
    <>
      <style>{`
        @keyframes panel-in {
          from{opacity:0;transform:translateY(12px) scale(.98)}
          to  {opacity:1;transform:translateY(0)    scale(1)}
        }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.2} }
        .j-panel { animation:panel-in 0.28s cubic-bezier(.22,1,.36,1) both }
        .j-blink { animation:blink 1.1s ease-in-out infinite }
      `}</style>

      {/* ── Panel — opened only via Ctrl+D ───────────────────────── */}
      {open && (
        <div className="j-panel fixed bottom-24 right-5 z-[9998] w-[360px] max-w-[calc(100vw-16px)]"
          style={{ fontFamily:"system-ui,sans-serif" }}>
          <div className="rounded-xl overflow-hidden"
            style={{ background:"#000", border:"1px solid #1a1a1a", boxShadow:"0 8px 40px rgba(0,0,0,.8)" }}>

            {/* header bar */}
            <div className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom:"1px solid #1a1a1a" }}>
              <span style={{ color:"#888", fontSize:11, letterSpacing:"0.15em", fontWeight:600 }}>
                DIAMOND STAR A.I.
              </span>
              <button onClick={toggleOpen}
                style={{ color:"#555", fontSize:16, lineHeight:1, background:"none", border:"none", cursor:"pointer" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color="#aaa"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color="#555"; }}>
                ✕
              </button>
            </div>

            {/* particle area — black background, full width, no clip */}
            <div ref={containerRef} style={{ width:"100%", height:260, background:"#000", display:"block" }} />

            {/* status */}
            <div className={phase !== "idle" ? "j-blink" : ""}
              style={{
                textAlign:"center", fontSize:10, letterSpacing:"0.2em", padding:"8px 0 4px",
                color: phase==="listening" ? "#e8603c" : phase==="speaking" ? "#c84b8f" : phase==="processing" ? "#ffb74d" : "#333",
              }}>
              {statusLabel}
            </div>

            {/* mic toggle + quick buttons */}
            <div className="px-4 pb-4 space-y-3">

              {/* mic button */}
              <div style={{ display:"flex", justifyContent:"center", padding:"4px 0" }}>
                <button onClick={toggleMic}
                  style={{
                    width:52, height:52, borderRadius:"50%", display:"flex",
                    alignItems:"center", justifyContent:"center", cursor:"pointer",
                    background: phase === "listening" ? "#1a1a1a" : "#111",
                    border: `1.5px solid ${phase === "listening" ? "#e8603c" : phase === "speaking" ? "#c84b8f" : "#444"}`,
                    boxShadow: phase === "listening" ? "0 0 20px #e8603caa" : phase === "speaking" ? "0 0 16px #c84b8f88" : "none",
                    transition:"all .2s",
                  }}>
                  {phase === "listening" ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <rect x="2" y="2" width="12" height="12" rx="2" fill="#e8603c"/>
                    </svg>
                  ) : phase === "speaking" ? (
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <circle cx="10" cy="10" r="2.5" fill="#c84b8f"/>
                      <path d="M6.5 7.5a4.5 4.5 0 0 0 0 5" stroke="#c84b8f" strokeWidth="1.3" strokeLinecap="round"/>
                      <path d="M13.5 7.5a4.5 4.5 0 0 1 0 5" stroke="#c84b8f" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <rect x="7" y="1" width="6" height="9" rx="3" fill="#777"/>
                      <path d="M4 9a6 6 0 0 0 12 0" stroke="#666" strokeWidth="1.4" strokeLinecap="round"/>
                      <line x1="10" y1="15" x2="10" y2="18" stroke="#555" strokeWidth="1.4" strokeLinecap="round"/>
                      <line x1="7" y1="18" x2="13" y2="18" stroke="#555" strokeWidth="1.4" strokeLinecap="round"/>
                    </svg>
                  )}
                </button>
              </div>

              {/* quick command buttons */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                {([
                  ["How are we doing?",    "How is the company doing overall?"],
                  ["Any red flags?",       "Should I be worried about anything?"],
                  ["Are we profitable?",   "Are we making money?"],
                  ["Cash position",        "What is our cash position?"],
                  ["What to focus on?",    "What should we focus on to improve?"],
                  ["Export Report",        "Export the report"],
                ] as [string,string][]).map(([label, cmd]) => (
                  <button key={label}
                    onClick={() => { setTranscript(cmd); handleInput(cmd); }}
                    disabled={phase === "speaking"}
                    style={{
                      fontSize:10, letterSpacing:"0.06em", padding:"7px 10px",
                      borderRadius:6, textAlign:"left", cursor:"pointer",
                      background:"#0f0f0f", border:"1px solid #222", color:"#777",
                      transition:"all .15s", opacity: phase==="speaking" ? 0.35 : 1,
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLButtonElement).style.background="#1a1a1a";
                      (e.currentTarget as HTMLButtonElement).style.color="#aaa";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.background="#0f0f0f";
                      (e.currentTarget as HTMLButtonElement).style.color="#777";
                    }}>
                    {label}
                  </button>
                ))}
              </div>

            </div>
          </div>
        </div>
      )}
    </>
  );
}
