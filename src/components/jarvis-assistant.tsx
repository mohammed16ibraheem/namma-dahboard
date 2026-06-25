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

/* ── JARVIS brain ────────────────────────────────────────────────────────  */
function jarvisReply(input: string, d: JarvisData): { text: string; farewell: boolean } {
  const q = input.toLowerCase();

  const farewell = /thank|thanks|bye|goodbye|that.s all|that is all|dismiss|close/.test(q);
  if (farewell)
    return { text: "Of course, sir. I remain on standby should you require further analysis.", farewell: true };

  if (/\b(hello|hi|hey|jarvis)\b/.test(q))
    return { text: `${timeGreet()} All systems are operational for ${d.company}. How may I assist you?`, farewell: false };

  if (/how.*(revenue|going|doing|performing)|revenue|income|sales|turnover/.test(q))
    return {
      text: `Revenue for the period ending ${d.period} stands at ${sar(d.revenue)}. ` +
        `Gross profit is ${sar(d.grossProfit)}, giving a gross margin of ${pct(d.gpMargin)}. ` +
        (d.gpMargin >= 35 ? "Excellent margins, sir." : d.gpMargin >= 20 ? "Margins are acceptable." : "Margins are below optimal — I recommend reviewing cost of goods sold."),
      farewell: false,
    };

  if (/profit|net profit|net income|bottom line|are we in profit|making money/.test(q))
    return {
      text: `Net profit after tax is ${sar(d.netProfit)}, representing a net margin of ${pct(d.netMargin)}. ` +
        (d.netProfit > 0
          ? `The company is operating profitably, sir.`
          : `I must flag that the company is currently at a loss. Immediate review is recommended.`),
      farewell: false,
    };

  if (/gross profit|gross margin/.test(q))
    return {
      text: `Gross profit is ${sar(d.grossProfit)}, representing a gross margin of ${pct(d.gpMargin)}. ` +
        (d.gpMargin >= 35 ? "Excellent margins." : d.gpMargin >= 20 ? "Margins are acceptable but there is room for improvement." : "Margins are below optimal levels."),
      farewell: false,
    };

  if (/balance sheet|total assets|assets/.test(q))
    return {
      text: `Total assets are valued at ${sar(d.totalAssets)}, with total equity of ${sar(d.totalEquity)} and total liabilities of ${sar(d.totalLiab)}. ` +
        `Current ratio is ${d.currentRatio.toFixed(2)}, ${d.currentRatio >= 1.5 ? "indicating strong short-term liquidity." : d.currentRatio >= 1 ? "which is acceptable." : "which is below one — a liquidity concern."}`,
      farewell: false,
    };

  if (/equity|shareholders|capital/.test(q))
    return {
      text: `Total equity stands at ${sar(d.totalEquity)}. Debt to equity ratio is ${d.debtToEquity.toFixed(2)}. ` +
        (d.debtToEquity <= 1 ? "The company maintains a conservative capital structure." : "Leverage is moderate. I recommend monitoring debt levels."),
      farewell: false,
    };

  if (/liabilit|debt/.test(q))
    return {
      text: `Total liabilities are ${sar(d.totalLiab)}. Debt to equity ratio is ${d.debtToEquity.toFixed(2)}. ` +
        (d.debtToEquity <= 1.5 ? "Debt levels are within acceptable parameters." : "Leverage is elevated. Shall I flag this for review?"),
      farewell: false,
    };

  if (/cash flow|operating cash/.test(q))
    return {
      text: `Operating cash flow is ${sar(d.operatingCF)}. Investing activities show ${sar(d.investingCF)}, and financing activities ${sar(d.financingCF)}. ` +
        (d.operatingCF > 0 ? "The business is generating positive operating cash flow — a healthy sign." : "Operating cash flow is negative. This requires attention, sir."),
      farewell: false,
    };

  if (/cash|liquid/.test(q))
    return {
      text: `Cash and cash equivalents stand at ${sar(d.cashBs)}. Current ratio is ${d.currentRatio.toFixed(2)}. ` +
        (d.currentRatio >= 1.5 ? "Liquidity position is strong." : "Liquidity is adequate but should be monitored."),
      farewell: false,
    };

  if (/tax|zakat|vat/.test(q))
    return {
      text: `Total tax obligations for this period amount to ${sar(d.taxTotal)}, covering Zakat, VAT, and withholding tax. ` +
        (d.taxTotal > 0 ? "All provisions are in order." : "No current tax obligations flagged."),
      farewell: false,
    };

  if (/export|report|download|excel/.test(q)) {
    d.onExport?.();
    return { text: "Certainly, sir. Generating the full financial report now. Five sheets, colour-coded by category. The file will download momentarily.", farewell: false };
  }

  if (/summary|overview|status|how are we|financial/.test(q))
    return {
      text: `Financial summary for ${d.company}, period ending ${d.period}. ` +
        `Revenue: ${sar(d.revenue)}. Net profit: ${sar(d.netProfit)} at ${pct(d.netMargin)} margin. ` +
        `Total assets: ${sar(d.totalAssets)}. Cash: ${sar(d.cashBs)}. Operating cash flow: ${sar(d.operatingCF)}. ` +
        (d.netProfit > 0 && d.operatingCF > 0 ? "All primary indicators are positive, sir." : "There are some areas requiring attention."),
      farewell: false,
    };

  if (/ratio|current ratio/.test(q))
    return {
      text: `Current ratio is ${d.currentRatio.toFixed(2)}. Debt to equity ratio is ${d.debtToEquity.toFixed(2)}. ` +
        (d.currentRatio >= 1.5 ? "Financial ratios are healthy." : "Some ratios warrant monitoring."),
      farewell: false,
    };

  if (/help|what can you/.test(q))
    return { text: "I can brief you on revenue, profit, cash flow, balance sheet, liabilities, tax, ratios, and generate the full financial report. Just ask.", farewell: false };

  return {
    text: `I didn't quite catch that, sir. Could you rephrase? I can help with revenue, profit, cash flow, balance sheet, or a full financial summary.`,
    farewell: false,
  };
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

    const SIZE = 180;

    const scene    = new THREE.Scene();
    const camera   = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);
    camera.position.z = 1;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(SIZE, SIZE);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
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

      /* listening phase: use REAL mic FFT data if available */
      if (ph === "listening" && analyserRef.current && audioDataRef.current) {
        analyserRef.current.getByteFrequencyData(audioDataRef.current as Uint8Array<ArrayBuffer>);
        const d = audioDataRef.current as Uint8Array<ArrayBuffer>;
        tLow  = freqAvg(d,  0,  20);
        tMid  = freqAvg(d, 20,  50);
        tHigh = freqAvg(d, 50, 100);
      } else if (ph === "listening") {
        /* mic not yet granted — subtle simulated pulse so sphere reacts */
        tLow  = 0.20 + 0.15 * Math.abs(Math.sin(t * 4.0));
        tMid  = 0.16 + 0.12 * Math.abs(Math.sin(t * 5.3));
        tHigh = 0.10 + 0.08 * Math.abs(Math.sin(t * 7.1));
      } else if (ph === "speaking") {
        tLow  = 0.35 + 0.25 * Math.abs(Math.sin(t * 3.1));
        tMid  = 0.28 + 0.20 * Math.abs(Math.sin(t * 4.7));
        tHigh = 0.18 + 0.15 * Math.abs(Math.sin(t * 6.3));
      } else if (ph === "processing") {
        tLow  = 0.20 + 0.12 * Math.abs(Math.sin(t * 2.0));
        tMid  = 0.30 + 0.18 * Math.abs(Math.sin(t * 3.5));
        tHigh = 0.12 + 0.10 * Math.abs(Math.sin(t * 5.0));
      } else {
        tLow  = 0.04 + 0.02 * Math.abs(Math.sin(t * 0.7));
        tMid  = 0.02 + 0.01 * Math.abs(Math.sin(t * 0.9));
        tHigh = 0.01 + 0.008 * Math.abs(Math.sin(t * 1.1));
      }

      curLow  += (tLow  - curLow)  * 0.08;
      curMid  += (tMid  - curMid)  * 0.08;
      curHigh += (tHigh - curHigh) * 0.08;

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

  /* ── open / close ────────────────────────────────────────────────────── */
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
        @keyframes arc-pulse {
          0%,100%{box-shadow:0 0 20px 5px #00d4ffaa,0 0 50px 10px #00d4ff44,inset 0 0 18px #00d4ff55}
          50%    {box-shadow:0 0 35px 10px #00d4ffdd,0 0 80px 20px #00d4ff77,inset 0 0 30px #00d4ffaa}
        }
        @keyframes arc-idle {
          0%,100%{box-shadow:0 0 12px 3px #00d4ff55,0 0 24px 5px #00d4ff22,inset 0 0 10px #00d4ff33}
          50%    {box-shadow:0 0 18px 5px #00d4ff77,0 0 36px 8px #00d4ff44,inset 0 0 18px #00d4ff55}
        }
        @keyframes arc-listen {
          0%,100%{box-shadow:0 0 18px 5px #00ff8877,0 0 40px 8px #00ff8833,inset 0 0 14px #00ff8844}
          50%    {box-shadow:0 0 30px 9px #00ff88bb,0 0 60px 14px #00ff8866,inset 0 0 24px #00ff8877}
        }
        @keyframes panel-in {
          from{opacity:0;transform:translateY(14px) scale(.97)}
          to  {opacity:1;transform:translateY(0)    scale(1)}
        }
        @keyframes ring-cw  { to{transform:rotate(360deg)}  }
        @keyframes ring-ccw { to{transform:rotate(-360deg)} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.25} }
        @keyframes scan  { from{top:-100%} to{top:200%} }

        .j-arc-idle   { animation:arc-idle   2.4s ease-in-out infinite }
        .j-arc-speak  { animation:arc-pulse  0.8s ease-in-out infinite }
        .j-arc-listen { animation:arc-listen 0.7s ease-in-out infinite }
        .j-ring-cw    { animation:ring-cw   8s linear infinite }
        .j-ring-ccw   { animation:ring-ccw 12s linear infinite }
        .j-panel      { animation:panel-in  0.3s cubic-bezier(.22,1,.36,1) both }
        .j-blink      { animation:blink 1.1s ease-in-out infinite }
        .j-scan::after {
          content:'';position:absolute;left:0;right:0;height:40px;
          background:linear-gradient(transparent,rgba(0,212,255,0.04),transparent);
          animation:scan 3s linear infinite;pointer-events:none;
        }
      `}</style>

      {/* ── Arc Reactor Button ────────────────────────────────────── */}
      <button
        onClick={toggleOpen}
        title="J.A.R.V.I.S — Click to activate"
        className={`fixed bottom-7 right-7 z-[9999] w-16 h-16 rounded-full border-2 border-cyan-400
          bg-[#001a2e] flex items-center justify-center
          transition-transform duration-200 hover:scale-110 focus:outline-none
          ${phase === "speaking" ? "j-arc-speak" : phase === "listening" ? "j-arc-listen" : "j-arc-idle"}`}
      >
        <div className="j-ring-cw  absolute inset-[-6px]  rounded-full border border-cyan-400/30 pointer-events-none" />
        <div className="j-ring-ccw absolute inset-[-11px] rounded-full border border-cyan-400/15 pointer-events-none" />
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
          <circle cx="18" cy="18" r="16" stroke="#00d4ff" strokeWidth="1.2" strokeOpacity=".4"/>
          <circle cx="18" cy="18" r="10" stroke="#00d4ff" strokeWidth="1.4" strokeOpacity=".75"/>
          <circle cx="18" cy="18" r="4"  fill="#00d4ff"  fillOpacity=".95"/>
          {[0,60,120,180,240,300].map(deg => (
            <line key={deg}
              x1={18 + 4.8*Math.cos(deg*Math.PI/180)} y1={18 + 4.8*Math.sin(deg*Math.PI/180)}
              x2={18 + 9.4*Math.cos(deg*Math.PI/180)} y2={18 + 9.4*Math.sin(deg*Math.PI/180)}
              stroke="#00d4ff" strokeWidth="1.5" strokeOpacity=".85"/>
          ))}
        </svg>
      </button>

      {/* ── Panel ─────────────────────────────────────────────────── */}
      {open && (
        <div className="j-panel fixed bottom-28 right-5 z-[9998] w-[370px] max-w-[calc(100vw-20px)]"
          style={{ fontFamily: "'Share Tech Mono','Courier New',monospace" }}>
          <div className="j-scan relative rounded-xl overflow-hidden"
            style={{
              background:     "linear-gradient(145deg,rgba(0,18,38,.97),rgba(0,8,24,.99))",
              border:         "1px solid rgba(0,212,255,.35)",
              boxShadow:      "0 0 50px rgba(0,212,255,.12),inset 0 0 30px rgba(0,212,255,.03)",
              backdropFilter: "blur(18px)",
            }}>

            {/* scan lines */}
            <div className="absolute inset-0 pointer-events-none" style={{
              backgroundImage:"repeating-linear-gradient(0deg,rgba(0,212,255,.022) 0,rgba(0,212,255,.022) 1px,transparent 1px,transparent 3px)"
            }}/>

            {/* corner marks */}
            {["tl","tr","bl","br"].map(cn => (
              <div key={cn} className={`absolute w-5 h-5 pointer-events-none
                ${cn==="tl"?"top-0 left-0  border-t-2 border-l-2":""}
                ${cn==="tr"?"top-0 right-0 border-t-2 border-r-2":""}
                ${cn==="bl"?"bottom-0 left-0  border-b-2 border-l-2":""}
                ${cn==="br"?"bottom-0 right-0 border-b-2 border-r-2":""}
                border-cyan-400/60`} />
            ))}

            <div className="relative p-5 space-y-4">

              {/* header */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-cyan-400 text-xs tracking-[.25em] font-bold">J.A.R.V.I.S</div>
                  <div className="text-cyan-400/40 text-[9px] tracking-[.18em]">FINANCIAL INTELLIGENCE SYSTEM</div>
                </div>
                <button onClick={toggleOpen} className="text-cyan-400/50 hover:text-cyan-400 transition-colors text-base leading-none">✕</button>
              </div>

              <div className="h-px" style={{ background:"linear-gradient(90deg,transparent,#00d4ff44,transparent)" }}/>

              {/* Three.js WebGL particle sphere */}
              <div className="flex justify-center items-center" style={{ height: 180 }}>
                <div
                  ref={containerRef}
                  style={{ width: 180, height: 180, borderRadius: "50%", overflow: "hidden" }}
                />
              </div>

              {/* status */}
              <div className={`text-center text-[10px] tracking-[.22em] -mt-2 ${phase!=="idle" ? "j-blink":""}`}
                style={{ color: statusColor }}>
                {statusLabel}
              </div>

              {/* mic button — icon only */}
              <div className="flex justify-center py-1">
                <button onClick={toggleMic}
                  className="w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 focus:outline-none"
                  style={{
                    background:  phase==="listening" ? "rgba(0,255,136,.15)" : phase==="speaking" ? "rgba(0,212,255,.1)" : "rgba(0,212,255,.06)",
                    border:      `2px solid ${phase==="listening" ? "rgba(0,255,136,.7)" : "rgba(0,212,255,.45)"}`,
                    boxShadow:   phase==="listening" ? "0 0 22px rgba(0,255,136,.35), inset 0 0 12px rgba(0,255,136,.1)"
                               : phase==="speaking"  ? "0 0 18px rgba(0,212,255,.3),  inset 0 0 10px rgba(0,212,255,.08)"
                               : "none",
                  }}>
                  {phase === "listening" ? (
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <rect x="3" y="3" width="12" height="12" rx="2" fill="#00ff88" fillOpacity=".9"/>
                    </svg>
                  ) : phase === "speaking" ? (
                    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                      <circle cx="11" cy="11" r="3" fill="#00d4ff" fillOpacity=".9"/>
                      <path d="M7 8a5.5 5.5 0 0 0 0 6" stroke="#00d4ff" strokeWidth="1.4" strokeLinecap="round" strokeOpacity=".7"/>
                      <path d="M15 8a5.5 5.5 0 0 1 0 6" stroke="#00d4ff" strokeWidth="1.4" strokeLinecap="round" strokeOpacity=".7"/>
                      <path d="M4.5 5.5A10 10 0 0 0 4.5 16.5" stroke="#00d4ff" strokeWidth="1.2" strokeLinecap="round" strokeOpacity=".4"/>
                      <path d="M17.5 5.5A10 10 0 0 1 17.5 16.5" stroke="#00d4ff" strokeWidth="1.2" strokeLinecap="round" strokeOpacity=".4"/>
                    </svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                      <rect x="8" y="2" width="6" height="10" rx="3" fill="#00d4ff" fillOpacity=".85"/>
                      <path d="M5 11a6 6 0 0 0 12 0" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round" strokeOpacity=".8"/>
                      <line x1="11" y1="17" x2="11" y2="20" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round" strokeOpacity=".7"/>
                      <line x1="8" y1="20" x2="14" y2="20" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round" strokeOpacity=".7"/>
                    </svg>
                  )}
                </button>
              </div>

              <div className="h-px" style={{ background:"linear-gradient(90deg,transparent,#00d4ff33,transparent)" }}/>

              {/* quick command buttons */}
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  ["Revenue",        "How is the revenue going?"],
                  ["Are we profit?", "Are we in profit?"],
                  ["Cash Flow",      "How is the cash flow?"],
                  ["Balance Sheet",  "Show the balance sheet"],
                  ["Summary",        "Give me a full financial summary"],
                  ["Export Report",  "Export the report"],
                ] as [string,string][]).map(([label, cmd]) => (
                  <button key={label}
                    onClick={() => { setTranscript(cmd); handleInput(cmd); }}
                    disabled={phase === "speaking"}
                    className="text-[10px] tracking-[.08em] px-2 py-2 rounded-md text-left transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background:"rgba(0,212,255,.06)", border:"1px solid rgba(0,212,255,.2)", color:"#7ecfea" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background="rgba(0,212,255,.14)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background="rgba(0,212,255,.06)"; }}>
                    {label}
                  </button>
                ))}
              </div>

              {/* footer */}
              <div className="text-center text-[9px] tracking-[.15em]" style={{ color:"#00d4ff22" }}>
                STARK INDUSTRIES · {data.company.toUpperCase()} · {data.period}
              </div>

            </div>
          </div>
        </div>
      )}
    </>
  );
}
