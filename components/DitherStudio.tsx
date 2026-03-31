"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Upload, Download, Code, RefreshCw,
  ChevronDown, ChevronRight, Copy, Check,
  Play, Pause, Film, ImageIcon, Type, Sun, Moon, Star,
  Columns2, FileVideo, X as XIcon, Eraser
} from "lucide-react";
import { ditherImage, drawDots, generateInteractionCode, generateReactCode, DEFAULT_PARAMS, DitherParams, DotCoord, BLEND_MODES, dotsToSVG } from "@/lib/dither";
import { imageDataToAscii, renderAsciiToCanvas, generateAsciiVideoCode, DEFAULT_ASCII_PARAMS, AsciiParams, AsciiCell } from "@/lib/ascii";
import { extractVideoFrames } from "@/lib/videoFrames";
import { decodeGif } from "@/lib/gifDecoder";
import { removeBackground } from "@/lib/bgErase";

import Slider from "./Slider";
import Toggle from "./Toggle";

const OUTPUT_SIZE = 600;
const MAX_VIDEO_FRAMES = 90;

// Debounce hook for expensive re-renders
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

type Tab = "studio" | "preview";
type Mode = "image" | "video" | "ascii";
type VideoRender = "dither" | "ascii";
type DetectedType = "image" | "video" | "gif" | null;

const ALGORITHMS = [
  { value: "floyd-steinberg", label: "Floyd-Steinberg" },
  { value: "atkinson", label: "Atkinson" },
  { value: "ordered", label: "Ordered (Bayer)" },
  { value: "threshold", label: "Hard Threshold" },
] as const;

const ASCII_CHARSET_OPTS = [
  { value: "detailed", label: "@#S%?*+;:,." },
  { value: "blocks", label: "█▓▒░" },
  { value: "pixel", label: "Pixel Blocks" },
  { value: "minimal", label: "@:. " },
  { value: "custom", label: "Custom" },
] as const;

const PAINT_ONLY_DITHER = new Set<keyof DitherParams>(["bgColor", "dotColor", "repelRadius", "repelStrength"]);
const PAINT_ONLY_ASCII = new Set<keyof AsciiParams>(["bgColor", "fgColor", "colored", "glow", "glowColor", "glowRadius"]);

function detectFileType(file: File): DetectedType {
  if (file.type === "image/gif") return "gif";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("image/")) return "image";
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "gif") return "gif";
  if (["mp4", "webm", "mov"].includes(ext ?? "")) return "video";
  if (["png", "jpg", "jpeg", "webp", "svg", "bmp"].includes(ext ?? "")) return "image";
  return null;
}

// Preset IDs from WelcomeScreen
const WELCOME_PRESETS: Record<string, { params?: Partial<DitherParams>; ascii?: Partial<AsciiParams>; renderEffect: VideoRender }> = {
  halftone: { renderEffect: "dither", params: { algorithm: "floyd-steinberg", scale: 4, dotMinRadius: 0.5, dotMaxRadius: 3, bgColor: "#ffffff", dotColor: "#111111" } },
  neon: { renderEffect: "dither", params: { useSourceColor: true, bgColor: "#000000", scale: 5, dotMinRadius: 0.8, dotMaxRadius: 2.5 } },
  blueprint: { renderEffect: "dither", params: { algorithm: "ordered", scale: 6, bgColor: "#0a1e4a", dotColor: "#a0c8ff", contrast: 30 } },
  ghost: { renderEffect: "dither", params: { threshold: 75, scale: 10, dotMaxRadius: 4, contrast: 45 } },
  ink: { renderEffect: "dither", params: { algorithm: "atkinson", scale: 4, dotMinRadius: 0.4, dotMaxRadius: 2, bgColor: "#f5f0e8", dotColor: "#1a1008" } },
  ascii: { renderEffect: "ascii", ascii: { glow: true, glowColor: "#00ff88", colored: false, fgColor: "#00ff88", bgColor: "#000000" } },
};

function computeDims(w: number, h: number) {
  const asp = w / h;
  let cw = OUTPUT_SIZE, ch = OUTPUT_SIZE;
  if (asp > 1) ch = Math.round(OUTPUT_SIZE / asp);
  else cw = Math.round(OUTPUT_SIZE * asp);
  return { cw, ch };
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", gap: 5, width: "100%", padding: "10px 16px 6px", background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}>
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <span style={{ fontSize: 9, fontFamily: "'Inter',sans-serif", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" }}>{title}</span>
      </button>
      {open && <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 12px 12px" }}>{children}</div>}
    </div>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "var(--row-bg)", borderRadius: 10,
        height: 36, padding: "0 12px", marginBottom: 4, transition: "background 0.15s",
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = "var(--row-bg-hover, var(--border))"}
      onMouseLeave={(e) => e.currentTarget.style.background = "var(--row-bg)"}
    >
      <span style={{
        fontSize: 11, fontFamily: "'Inter',sans-serif", fontWeight: 500,
        color: "var(--muted)", letterSpacing: "-0.01em",
      }}>
        {label.charAt(0).toUpperCase() + label.slice(1).toLowerCase()}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: "var(--muted)", fontSize: 10, fontFamily: "'JetBrains Mono',monospace" }}>{value}</span>
        <label style={{ position: "relative", width: 20, height: 20, borderRadius: "50%", border: "none", overflow: "hidden", cursor: "pointer", flexShrink: 0, background: value, boxShadow: "0px 1px 3px rgba(0,0,0,0.15)" }}>
          <input type="color" value={value} onChange={e => onChange(e.target.value)}
            style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer", padding: 0 }} />
        </label>
      </div>
    </div>
  );
}

function SubToggle({ value, onChange }: { value: VideoRender; onChange: (v: VideoRender) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}>
      {(["dither", "ascii"] as VideoRender[]).map(v => (
        <button key={v} onClick={() => onChange(v)}
          style={{
            padding: "8px 0", fontSize: 11, fontFamily: "'Inter',sans-serif", fontWeight: 600,
            borderRadius: 10, border: "none", cursor: "pointer",
            background: value === v
              ? "linear-gradient(to bottom, var(--accent-from), var(--accent-to))"
              : "var(--row-bg)",
            color: value === v ? "#fff" : "var(--muted)",
            boxShadow: value === v ? "0px 2px 8px rgba(124,90,240,0.35), inset 0px 1px 0px rgba(255,255,255,0.2)" : "none",
            transition: "all 0.15s",
          }}>
          {v === "dither" ? "Dither" : "ASCII"}
        </button>
      ))}
    </div>
  );
}

export default function DitherStudio() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const studioCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const originalImageRef = useRef<HTMLImageElement | null>(null);
  const imageDataRef = useRef<ImageData | null>(null);

  type PhysDot = DotCoord & { ox: number; oy: number; tx: number; ty: number; vx: number; vy: number };
  const previewDotsRef = useRef<PhysDot[]>([]);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const rafRef = useRef<number>(0);

  const ditherFramesRef = useRef<DotCoord[][]>([]);
  const asciiFramesRef = useRef<AsciiCell[][]>([]);
  const rawFramesRef = useRef<ImageData[]>([]);
  const canvasSizeRef = useRef({ w: OUTPUT_SIZE, h: OUTPUT_SIZE });

  const videoRafRef = useRef<number>(0);
  const frameIdxRef = useRef(0);
  const videoPlayingRef = useRef(false);
  const lastFrameTimeRef = useRef(0);

  const paramsRef = useRef<DitherParams>(DEFAULT_PARAMS);
  const asciiParamsRef = useRef<AsciiParams>(DEFAULT_ASCII_PARAMS);

  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [tab, setTab] = useState<Tab>("studio");
  const [mode, setMode] = useState<Mode>("image");
  const [videoRender, setVideoRender] = useState<VideoRender>("dither");
  const [detectedType, setDetectedType] = useState<DetectedType>(null);
  const videoRenderRef = useRef<VideoRender>("dither");
  const [params, setParams] = useState<DitherParams>(DEFAULT_PARAMS);
  const [asciiParams, setAsciiParams] = useState<AsciiParams>(DEFAULT_ASCII_PARAMS);
  const [dots, setDots] = useState<DotCoord[]>([]);
  const [dotsRef] = useState(() => ({ current: [] as DotCoord[] }));
  const [dotCount, setDotCount] = useState(0);
  const [hasMedia, setHasMedia] = useState(false);
  const [mediaName, setMediaName] = useState("");
  const [rendering, setRendering] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState<"json" | "code" | "ascii" | "react" | null>(null);
  const [codeModal, setCodeModal] = useState<string | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: OUTPUT_SIZE, h: OUTPUT_SIZE });
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [videoFrameCount, setVideoFrameCount] = useState(0);
  const [videoCurrentFrame, setVideoCurFrame] = useState(0);
  const [videoFps, setVideoFps] = useState(24);
  const [progressLabel, setProgressLabel] = useState("");
  const [githubStars, setGithubStars] = useState<number | null>(null);
  const [showCompare, setShowCompare] = useState(false);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [exportingWebM, setExportingWebM] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [bgEraseEnabled, setBgEraseEnabled] = useState(false);
  const bgEraseRef = useRef(false);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [scale, setScale] = useState(1.0);
  const scaleRef = useRef(1.0);
  const [transformOpen, setTransformOpen] = useState(true);
  const debouncedScale = useDebounce(scale, 100);

  const compareCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingSplitRef = useRef(false);
  type Effect = "repel" | "attract" | "wave" | "noise" | "vortex" | "breathe";
  const [effect, setEffect] = useState<Effect>("repel");
  const effectRef = useRef<Effect>("repel");
  useEffect(() => { effectRef.current = effect; }, [effect]);

  const isVideo = mode === "video";
  const isAscii = mode === "ascii" || (isVideo && videoRender === "ascii");
  const showDots = mode === "image" || (isVideo && videoRender === "dither");
  const canBg = bgEraseEnabled ? "transparent" : (isAscii ? asciiParams.bgColor : (hasMedia ? params.bgColor : "var(--bg)"));
  const isLoading = isExtracting || isProcessing;

  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);

  // Keep videoRenderRef in sync
  useEffect(() => { videoRenderRef.current = videoRender; }, [videoRender]);

  // Fetch GitHub stars
  useEffect(() => {
    fetch("https://api.github.com/repos/prasanjit-dey-ux/ditherit")
      .then(r => r.json())
      .then(d => { if (typeof d.stargazers_count === "number") setGithubStars(d.stargazers_count); })
      .catch(() => { });
  }, []);

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const setParam = useCallback(<K extends keyof DitherParams>(k: K, v: DitherParams[K]) => {
    setParams(p => { const n = { ...p, [k]: v }; paramsRef.current = n; return n; });
  }, []);
  const setAsciiParam = useCallback(<K extends keyof AsciiParams>(k: K, v: AsciiParams[K]) => {
    setAsciiParams(p => { const n = { ...p, [k]: v }; asciiParamsRef.current = n; return n; });
  }, []);
  void setParam; void setAsciiParam;

  const repaintDither = useCallback((frameDots: DotCoord[], p: DitherParams) => {
    const canvas = studioCanvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    drawDots(ctx, frameDots, p, canvas.width, canvas.height, bgEraseRef.current);
  }, []);

  const repaintAscii = useCallback((cells: AsciiCell[], ap: AsciiParams) => {
    const canvas = studioCanvasRef.current; if (!canvas) return;
    const { w, h } = canvasSizeRef.current;
    renderAsciiToCanvas(canvas, cells, { ...ap, transparentBg: bgEraseRef.current }, w, h);
  }, []);

  const workerRef = useRef<Worker | null>(null);
  const renderImageDither = useCallback(async (img: HTMLImageElement, p: DitherParams) => {
    if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }
    setRendering(true);
    const sc = scaleRef.current;
    const srcW = Math.max(1, Math.round(img.naturalWidth * sc));
    const srcH = Math.max(1, Math.round(img.naturalHeight * sc));
    const { cw, ch } = computeDims(srcW, srcH);
    const canvas = studioCanvasRef.current!;
    canvas.width = cw; canvas.height = ch;
    canvasSizeRef.current = { w: cw, h: ch }; setCanvasSize({ w: cw, h: ch });

    const off = document.createElement("canvas");
    off.width = srcW; off.height = srcH;
    const offCtx = off.getContext("2d", { willReadFrequently: true })!;
    offCtx.clearRect(0, 0, srcW, srcH);
    offCtx.drawImage(img, 0, 0, srcW, srcH);
    const imageData = offCtx.getImageData(0, 0, srcW, srcH);
    imageDataRef.current = imageData;

    const worker = new Worker(new URL("../lib/dither.worker.ts", import.meta.url));
    workerRef.current = worker;

    const newDots: DotCoord[] = await new Promise((res, rej) => {
      worker.onmessage = e => { res(e.data.dots); worker.terminate(); workerRef.current = null; };
      worker.onerror = e => { rej(e); worker.terminate(); workerRef.current = null; };
      worker.postMessage({ imageData, params: p, outputWidth: cw, outputHeight: ch, frameIndex: 0 });
    });

    dotsRef.current = newDots;
    setDots(newDots); setDotCount(newDots.length);
    repaintDither(newDots, p);
    setRendering(false);
  }, [repaintDither, dotsRef]);

  const renderImageAscii = useCallback((img: HTMLImageElement, ap: AsciiParams, transparent?: boolean) => {
    setRendering(true);
    const transparentBg = transparent !== undefined ? transparent : bgEraseRef.current;
    const sc = scaleRef.current;
    const srcW = Math.max(1, Math.round(img.naturalWidth * sc));
    const srcH = Math.max(1, Math.round(img.naturalHeight * sc));
    const { cw, ch } = computeDims(srcW, srcH);
    const canvas = studioCanvasRef.current!;
    canvas.width = cw; canvas.height = ch;
    canvasSizeRef.current = { w: cw, h: ch }; setCanvasSize({ w: cw, h: ch });
    const off = document.createElement("canvas");
    off.width = srcW; off.height = srcH;
    const offCtx2 = off.getContext("2d", { willReadFrequently: true })!;
    offCtx2.clearRect(0, 0, srcW, srcH);
    offCtx2.drawImage(img, 0, 0, srcW, srcH);
    const imageData = offCtx2.getImageData(0, 0, srcW, srcH);
    const cells = imageDataToAscii(imageData, ap, cw, ch);
    renderAsciiToCanvas(canvas, cells, { ...ap, transparentBg }, cw, ch);
    setRendering(false);
  }, []);

  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasMediaRef = useRef(false);
  const isVideoRef = useRef(false);
  const modeRef = useRef<Mode>("image");
  const isReprocessingRef = useRef(false);
  const erasedFramesRef = useRef<ImageData[]>([]);
  const isErasingBgRef = useRef(false);

  const getActiveFrames = useCallback(() => {
    return bgEraseRef.current && erasedFramesRef.current.length === rawFramesRef.current.length
      ? erasedFramesRef.current
      : rawFramesRef.current;
  }, []);

  useEffect(() => { hasMediaRef.current = hasMedia; }, [hasMedia]);
  useEffect(() => { isVideoRef.current = isVideo; }, [isVideo]);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  /* ── Re-dither all raw frames (for structural param changes in video mode) ── */
  const reprocessDitherFrames = useCallback(async (p: DitherParams) => {
    if (isReprocessingRef.current) return;
    isReprocessingRef.current = true;
    const frames = getActiveFrames();
    if (!frames.length) { isReprocessingRef.current = false; return; }
    const { w: width, h: height } = canvasSizeRef.current;
    const dFrames: DotCoord[][] = [];
    for (let i = 0; i < frames.length; i++) {
      dFrames.push(ditherImage(frames[i], p, width, height));
      if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
    }
    ditherFramesRef.current = dFrames;
    dotsRef.current = dFrames[0] ?? [];
    setDots(dFrames[0] ?? []); setDotCount((dFrames[0] ?? []).length);
    const idx = frameIdxRef.current;
    const f = dFrames[idx] ?? dFrames[0];
    if (f) repaintDither(f, p);
    isReprocessingRef.current = false;
  }, [repaintDither, dotsRef]);

  /* ── Re-ascii all raw frames (for structural param changes in video+ASCII mode) ── */
  const reprocessAsciiFrames = useCallback(async (ap: AsciiParams) => {
    if (isReprocessingRef.current) return;
    isReprocessingRef.current = true;
    const frames = getActiveFrames();
    if (!frames.length) { isReprocessingRef.current = false; return; }
    const { w: width, h: height } = canvasSizeRef.current;
    const aFrames: AsciiCell[][] = [];
    for (let i = 0; i < frames.length; i++) {
      aFrames.push(imageDataToAscii(frames[i], ap, width, height));
      if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
    }
    asciiFramesRef.current = aFrames;
    const idx = frameIdxRef.current;
    const f = aFrames[idx] ?? aFrames[0];
    if (f) repaintAscii(f, ap);
    isReprocessingRef.current = false;
  }, [repaintAscii]);

  const triggerRender = useCallback((p: DitherParams, prev: DitherParams) => {
    if (!hasMediaRef.current || isVideoRef.current || modeRef.current !== "image" || !imageRef.current) return;
    const changed = (Object.keys(p) as (keyof DitherParams)[]).filter(k => p[k] !== prev[k]);
    if (changed.length === 0) return;
    const onlyPaint = changed.every(k => PAINT_ONLY_DITHER.has(k));
    if (onlyPaint && dotsRef.current.length > 0) {
      repaintDither(dotsRef.current, p);
    } else {
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = setTimeout(() => {
        renderImageDither(imageRef.current!, paramsRef.current);
      }, 80);
    }
  }, [repaintDither, renderImageDither, dotsRef]);

  const triggerAsciiRender = useCallback((ap: AsciiParams, prev: AsciiParams) => {
    if (!hasMediaRef.current || isVideoRef.current || modeRef.current !== "ascii" || !imageRef.current) return;
    const changed = (Object.keys(ap) as (keyof AsciiParams)[]).filter(k => ap[k] !== prev[k]);
    if (changed.length === 0) return;
    const onlyPaint = changed.every(k => PAINT_ONLY_ASCII.has(k));
    if (onlyPaint) {
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
      renderImageAscii(imageRef.current!, ap);
    } else {
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = setTimeout(() => {
        renderImageAscii(imageRef.current!, asciiParamsRef.current);
      }, 80);
    }
  }, [renderImageAscii]);

  const prevParamsRef = useRef<DitherParams>(DEFAULT_PARAMS);
  const prevAsciiParamsRef = useRef<AsciiParams>(DEFAULT_ASCII_PARAMS);

  const setParamLive = useCallback(<K extends keyof DitherParams>(k: K, v: DitherParams[K]) => {
    setParams(p => {
      const n = { ...p, [k]: v };
      paramsRef.current = n;
      if (isVideoRef.current && hasMediaRef.current) {
        // Video mode: repaint or reprocess
        const changed = (Object.keys(n) as (keyof DitherParams)[]).filter(key => n[key] !== p[key]);
        if (changed.every(key => PAINT_ONLY_DITHER.has(key))) {
          const idx = frameIdxRef.current;
          const f = ditherFramesRef.current[idx];
          if (f) repaintDither(f, n);
        } else {
          reprocessDitherFrames(n);
        }
      } else {
        triggerRender(n, prevParamsRef.current);
      }
      prevParamsRef.current = n;
      return n;
    });
  }, [triggerRender, repaintDither, reprocessDitherFrames]);

  const setAsciiParamLive = useCallback(<K extends keyof AsciiParams>(k: K, v: AsciiParams[K]) => {
    setAsciiParams(p => {
      const n = { ...p, [k]: v };
      asciiParamsRef.current = n;
      if (isVideoRef.current && hasMediaRef.current && videoRenderRef.current === "ascii") {
        // Video+ASCII mode: repaint or reprocess
        const changed = (Object.keys(n) as (keyof AsciiParams)[]).filter(key => n[key] !== p[key]);
        if (changed.every(key => PAINT_ONLY_ASCII.has(key))) {
          const idx = frameIdxRef.current;
          const f = asciiFramesRef.current[idx];
          if (f) repaintAscii(f, n);
        } else {
          reprocessAsciiFrames(n);
        }
      } else {
        triggerAsciiRender(n, prevAsciiParamsRef.current);
      }
      prevAsciiParamsRef.current = n;
      return n;
    });
  }, [triggerAsciiRender, repaintAscii, reprocessAsciiFrames]);

  useEffect(() => {
    if (!hasMedia || !isVideo || videoPlaying) return;
    const idx = frameIdxRef.current;
    if (videoRender === "dither") { const f = ditherFramesRef.current[idx]; if (f) repaintDither(f, params); }
    else { const f = asciiFramesRef.current[idx]; if (f) repaintAscii(f, asciiParams); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoRender, params.bgColor, params.dotColor, asciiParams.bgColor, asciiParams.fgColor, asciiParams.colored, asciiParams.glow, asciiParams.glowColor, asciiParams.glowRadius]);

  const sourceColorProcessing = useRef(false);
  useEffect(() => {
    if (!hasMedia || !isVideo || !rawFramesRef.current.length) return;
    if (sourceColorProcessing.current) return;
    sourceColorProcessing.current = true;
    const frames = getActiveFrames();
    const { w: width, h: height } = canvasSizeRef.current;
    const p = paramsRef.current;
    setIsProcessing(true);
    setProgressLabel("Re-processing source colors…");
    (async () => {
      const dFrames: DotCoord[][] = [];
      for (let i = 0; i < frames.length; i++) {
        dFrames.push(ditherImage(frames[i], p, width, height));
        if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
      }
      ditherFramesRef.current = dFrames;
      dotsRef.current = dFrames[0] ?? [];
      setDots(dFrames[0] ?? []); setDotCount((dFrames[0] ?? []).length);
      const idx = frameIdxRef.current;
      const f = dFrames[idx] ?? dFrames[0];
      if (f) repaintDither(f, paramsRef.current);
      setIsProcessing(false);
      sourceColorProcessing.current = false;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.useSourceColor]);

  // Apply bg erase to an HTMLImageElement → returns a Promise of new img with transparent bg
  const applyBgErase = useCallback((img: HTMLImageElement, enabled: boolean): Promise<HTMLImageElement> => {
    if (!enabled) return Promise.resolve(img);
    const off = document.createElement("canvas");
    off.width = img.width; off.height = img.height;
    const ctx = off.getContext("2d", { willReadFrequently: true })!;
    ctx.clearRect(0, 0, img.width, img.height);
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    const erased = removeBackground(imageData);
    ctx.putImageData(erased, 0, 0);
    return new Promise<HTMLImageElement>((resolve) => {
      const result = new Image();
      result.onload = () => resolve(result);
      result.src = off.toDataURL();
    });
  }, []);

  // Re-render when BG erase toggled
  useEffect(() => {
    bgEraseRef.current = bgEraseEnabled;
    if (!hasMedia) return;
    
    if (isVideoRef.current) {
      if (bgEraseEnabled && erasedFramesRef.current.length === 0 && rawFramesRef.current.length > 0 && !isErasingBgRef.current) {
        isErasingBgRef.current = true;
        setIsProcessing(true);
        (async () => {
          const frames = rawFramesRef.current;
          const activeFrames: ImageData[] = [];
          for (let i = 0; i < frames.length; i++) {
            setProgressLabel(`Removing Background ${i + 1}/${frames.length}`);
            setVideoProgress(i / frames.length);
            activeFrames.push(removeBackground(frames[i]));
            if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
          }
          erasedFramesRef.current = activeFrames;
          isErasingBgRef.current = false;
          
          setProgressLabel("Updating Video Frames…");
          await reprocessDitherFrames(paramsRef.current);
          await reprocessAsciiFrames(asciiParamsRef.current);
          setIsProcessing(false);
        })();
        return;
      }
      
      // If turning off, or if already cached, reprocess directly
      (async () => {
        setIsProcessing(true);
        setProgressLabel("Updating Video Frames…");
        await reprocessDitherFrames(paramsRef.current);
        await reprocessAsciiFrames(asciiParamsRef.current);
        setIsProcessing(false);
      })();
      return;
    }
    const orig = originalImageRef.current;
    if (!orig) return;
    applyBgErase(orig, bgEraseEnabled).then((processed) => {
      imageRef.current = processed;
      // Pass transparent flag explicitly so there's no ref timing issue
      if (modeRef.current === "ascii") renderImageAscii(processed, asciiParamsRef.current, bgEraseEnabled);
      else renderImageDither(processed, paramsRef.current);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgEraseEnabled]);

  // Keep scaleRef in sync
  useEffect(() => { scaleRef.current = scale; }, [scale]);

  // Re-render image when scale changes (debounced)
  useEffect(() => {
    if (!hasMedia || isVideoRef.current) return;
    const img = imageRef.current;
    if (!img) return;
    if (modeRef.current === "ascii") renderImageAscii(img, asciiParamsRef.current);
    else renderImageDither(img, paramsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedScale]);

  const loadImage = useCallback((file: File) => {
    setMode("image"); setMediaName(file.name);
    setDetectedType(detectFileType(file));
    setShowWelcome(false);
    const img = new Image();
    img.onload = () => {
      originalImageRef.current = img; // save original before bg erase
      applyBgErase(img, bgEraseEnabled).then((processed) => {
        imageRef.current = processed; setHasMedia(true); renderImageDither(processed, paramsRef.current);
      });
    };
    img.src = URL.createObjectURL(file);
  }, [renderImageDither, applyBgErase, bgEraseEnabled]);

  const loadAsciiImage = useCallback((file: File) => {
    setMode("ascii"); setMediaName(file.name);
    setDetectedType(detectFileType(file));
    setShowWelcome(false);
    const img = new Image();
    img.onload = () => {
      originalImageRef.current = img; // save original before bg erase
      applyBgErase(img, bgEraseEnabled).then((processed) => {
        imageRef.current = processed; setHasMedia(true);
        renderImageAscii(processed, asciiParamsRef.current, bgEraseEnabled);
      });
    };
    img.src = URL.createObjectURL(file);
  }, [renderImageAscii, applyBgErase, bgEraseEnabled]);

  const loadVideo = useCallback(async (file: File) => {
    setMode("video"); setMediaName(file.name);
    setDetectedType(detectFileType(file));
    setHasMedia(false); setIsExtracting(true);
    setVideoProgress(0); setProgressLabel("Reading video…");
    ditherFramesRef.current = []; asciiFramesRef.current = []; rawFramesRef.current = [];
    frameIdxRef.current = 0; setVideoCurFrame(0);
    setVideoPlaying(false); videoPlayingRef.current = false;
    try {
      const { frames, width, height } = await extractVideoFrames(
        file, videoFps, OUTPUT_SIZE, MAX_VIDEO_FRAMES,
        (ratio, label) => { setVideoProgress(ratio * 0.35); setProgressLabel(label); }
      );
      rawFramesRef.current = frames;
      erasedFramesRef.current = [];
      const canvas = studioCanvasRef.current!;
      canvas.width = width; canvas.height = height;
      canvasSizeRef.current = { w: width, h: height }; setCanvasSize({ w: width, h: height });
      setIsExtracting(false); setIsProcessing(true);

      const p = paramsRef.current;
      const ap = asciiParamsRef.current;

      const activeFrames: ImageData[] = [];
      if (bgEraseRef.current) {
        for (let i = 0; i < frames.length; i++) {
          setProgressLabel(`Removing Background ${i + 1}/${frames.length}`);
          setVideoProgress(i / frames.length);
          activeFrames.push(removeBackground(frames[i]));
          if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
        }
        erasedFramesRef.current = activeFrames;
      } else {
        activeFrames.push(...frames);
      }

      const dFrames: DotCoord[][] = [];
      for (let i = 0; i < activeFrames.length; i++) {
        setProgressLabel(`Dithering ${i + 1}/${activeFrames.length}`);
        setVideoProgress(0.35 + (i / activeFrames.length) * 0.35);
        dFrames.push(ditherImage(activeFrames[i], p, width, height));
        if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
      }
      ditherFramesRef.current = dFrames;

      const aFrames: AsciiCell[][] = [];
      for (let i = 0; i < activeFrames.length; i++) {
        setProgressLabel(`ASCII ${i + 1}/${activeFrames.length}`);
        setVideoProgress(0.70 + (i / activeFrames.length) * 0.30);
        aFrames.push(imageDataToAscii(activeFrames[i], ap, width, height));
        if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
      }
      asciiFramesRef.current = aFrames;

      setVideoFrameCount(frames.length);
      dotsRef.current = dFrames[0] ?? [];
      setDots(dFrames[0] ?? []); setDotCount((dFrames[0] ?? []).length);
      const vr = videoRender;
      if (vr === "dither") repaintDither(dFrames[0] ?? [], p);
      else repaintAscii(aFrames[0] ?? [], ap);
      setHasMedia(true); setIsProcessing(false);
    } catch (e) {
      console.error("Video error:", e);
      setIsExtracting(false); setIsProcessing(false);
      setProgressLabel("Error — " + (e as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoFps, videoRender, repaintDither, repaintAscii, dotsRef]);

  /* ── Load GIF: decode all frames → same pipeline as video ── */
  const loadGif = useCallback(async (file: File) => {
    setMode("video"); setMediaName(file.name);
    setDetectedType(detectFileType(file));
    setHasMedia(false); setIsExtracting(true);
    setVideoProgress(0); setProgressLabel("Decoding GIF…");
    ditherFramesRef.current = []; asciiFramesRef.current = []; rawFramesRef.current = [];
    frameIdxRef.current = 0; setVideoCurFrame(0);
    setVideoPlaying(false); videoPlayingRef.current = false;
    try {
      const { frames, fps: gifFps, width, height } = await decodeGif(
        file,
        (ratio, label) => { setVideoProgress(ratio * 0.35); setProgressLabel(label); }
      );
      rawFramesRef.current = frames;
      erasedFramesRef.current = [];
      const canvas = studioCanvasRef.current!;
      canvas.width = width; canvas.height = height;
      canvasSizeRef.current = { w: width, h: height }; setCanvasSize({ w: width, h: height });
      setVideoFps(gifFps);
      setIsExtracting(false); setIsProcessing(true);
      const p = paramsRef.current; const ap = asciiParamsRef.current;

      const activeFrames: ImageData[] = [];
      if (bgEraseRef.current) {
        for (let i = 0; i < frames.length; i++) {
          setProgressLabel(`Removing Background ${i + 1}/${frames.length}`);
          setVideoProgress(i / frames.length);
          activeFrames.push(removeBackground(frames[i]));
          if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
        }
        erasedFramesRef.current = activeFrames;
      } else {
        activeFrames.push(...frames);
      }

      const dFrames: DotCoord[][] = [];
      for (let i = 0; i < activeFrames.length; i++) {
        setProgressLabel(`Dithering ${i + 1}/${activeFrames.length}`); setVideoProgress(0.35 + (i / activeFrames.length) * 0.35);
        dFrames.push(ditherImage(activeFrames[i], p, width, height));
        if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
      }
      ditherFramesRef.current = dFrames;
      const aFrames: AsciiCell[][] = [];
      for (let i = 0; i < activeFrames.length; i++) {
        setProgressLabel(`ASCII ${i + 1}/${activeFrames.length}`); setVideoProgress(0.70 + (i / activeFrames.length) * 0.30);
        aFrames.push(imageDataToAscii(activeFrames[i], ap, width, height));
        if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
      }
      asciiFramesRef.current = aFrames;
      setVideoFrameCount(frames.length);
      dotsRef.current = dFrames[0] ?? [];
      setDots(dFrames[0] ?? []); setDotCount((dFrames[0] ?? []).length);
      const vr = videoRenderRef.current;
      if (vr === "dither") repaintDither(dFrames[0] ?? [], p);
      else repaintAscii(aFrames[0] ?? [], ap);
      setHasMedia(true); setIsProcessing(false);
    } catch (e) {
      console.error("GIF error:", e);
      setIsExtracting(false); setIsProcessing(false);
      setProgressLabel("Error — " + (e as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repaintDither, dotsRef]);

  const handleFile = useCallback((file: File) => {
    setShowWelcome(false);
    const t = file.type;
    // Auto-detect: video/gif → video pipeline, image → image or ascii based on current output mode
    if (t === "image/gif") {
      loadGif(file);
    } else if (t.startsWith("video/")) {
      loadVideo(file);
    } else if (t.startsWith("image/")) {
      // If currently in ascii output mode keep ascii, otherwise dither
      videoRenderRef.current === "ascii" || modeRef.current === "ascii"
        ? loadAsciiImage(file)
        : loadImage(file);
    }
  }, [loadImage, loadAsciiImage, loadVideo, loadGif]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1 || items[i].type.indexOf("video") !== -1) {
          const file = items[i].getAsFile();
          if (file) { handleFile(file); break; }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handleFile]);

  useEffect(() => {
    const onDragOver = (e: DragEvent) => { e.preventDefault(); setDragging(true); };
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      if (!e.relatedTarget || (e.relatedTarget as HTMLElement).nodeName === "HTML") setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault(); setDragging(false);
      const f = e.dataTransfer?.files[0]; if (f) handleFile(f);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [handleFile]);

  /* ── Video playback loop ── */
  useEffect(() => {
    if (!isVideo || !hasMedia) return;
    if (!videoPlaying) {
      const idx = frameIdxRef.current;
      if (videoRender === "dither") { const f = ditherFramesRef.current[idx]; if (f) repaintDither(f, paramsRef.current); }
      else { const f = asciiFramesRef.current[idx]; if (f) repaintAscii(f, asciiParamsRef.current); }
      return;
    }
    const interval = 1000 / videoFps;
    const loop = (time: number) => {
      if (!videoPlayingRef.current) return;
      if (time - lastFrameTimeRef.current >= interval) {
        lastFrameTimeRef.current = time;
        const total = videoRender === "dither" ? ditherFramesRef.current.length : asciiFramesRef.current.length;
        if (!total) return;
        frameIdxRef.current = (frameIdxRef.current + 1) % total;
        setVideoCurFrame(frameIdxRef.current);
        if (videoRender === "dither") { const f = ditherFramesRef.current[frameIdxRef.current]; if (f) repaintDither(f, paramsRef.current); }
        else { const f = asciiFramesRef.current[frameIdxRef.current]; if (f) repaintAscii(f, asciiParamsRef.current); }
      }
      videoRafRef.current = requestAnimationFrame(loop);
    };
    videoRafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(videoRafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoPlaying, videoRender, hasMedia, videoFps]);

  /* ── Preview: spring physics with swappable effects ── */
  useEffect(() => {
    if (tab !== "preview" || !hasMedia || isAscii) return;
    const canvas = previewCanvasRef.current; if (!canvas) return;
    const { w, h } = canvasSizeRef.current;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    const SPRING = 0.12, DAMPING = 0.78;
    const interval = 1000 / videoFps;
    let fidx = 0, lastFrameT = 0, prevTime = 0, t = 0;
    const initDots = isVideo ? (ditherFramesRef.current[0] ?? []) : dotsRef.current;
    previewDotsRef.current = initDots.map(d => ({ ...d, ox: d.x, oy: d.y, tx: d.x, ty: d.y, vx: 0, vy: 0 }));
    // Simple deterministic noise helper
    const noise2 = (x: number, y: number) => {
      const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      return n - Math.floor(n);
    };
    const loop = (time: number) => {
      const dt = Math.min((time - prevTime) / 16.67, 2); prevTime = time; t += 0.016 * dt;
      const mouse = mouseRef.current; const p = paramsRef.current;
      const eff = effectRef.current;
      // Advance video frame
      if (isVideo && ditherFramesRef.current.length > 1 && time - lastFrameT >= interval) {
        lastFrameT = time; fidx = (fidx + 1) % ditherFramesRef.current.length;
        const next = ditherFramesRef.current[fidx]; const prev = previewDotsRef.current;
        const len = Math.min(prev.length, next.length);
        for (let i = 0; i < len; i++) {
          prev[i].tx = next[i].x; prev[i].ty = next[i].y; prev[i].r = next[i].r;
          if (next[i].cr !== undefined) { prev[i].cr = next[i].cr; prev[i].cg = next[i].cg; prev[i].cb = next[i].cb; }
        }
        if (next.length > prev.length)
          for (let i = prev.length; i < next.length; i++)
            prev.push({ ...next[i], ox: next[i].x, oy: next[i].y, tx: next[i].x, ty: next[i].y, vx: 0, vy: 0 });
        previewDotsRef.current = prev.slice(0, next.length);
      }
      for (const d of previewDotsRef.current) {
        // Spring toward target (video frame morphing)
        d.ox += (d.tx - d.ox) * 0.18 * dt; d.oy += (d.ty - d.oy) * 0.18 * dt;
        const sx = (d.ox - d.x) * SPRING * dt, sy = (d.oy - d.y) * SPRING * dt;
        let fx = sx, fy = sy;
        const dx = d.x - mouse.x, dy = d.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (eff === "repel") {
          if (dist < p.repelRadius && dist > 0.5) {
            const tt = 1 - dist / p.repelRadius, force = tt * tt * tt * p.repelStrength;
            fx += (dx / dist) * force * dt; fy += (dy / dist) * force * dt;
          }
        } else if (eff === "attract") {
          if (dist < p.repelRadius && dist > 0.5) {
            const tt = 1 - dist / p.repelRadius, force = tt * tt * tt * p.repelStrength;
            fx -= (dx / dist) * force * dt; fy -= (dy / dist) * force * dt;
          }
        } else if (eff === "wave") {
          const amp = p.repelStrength * 0.4;
          const lambda = Math.max(w, h) * 0.15;
          d.x = d.ox + Math.sin(d.oy / lambda + t * 2.5) * amp;
          d.y = d.oy + Math.sin(d.ox / lambda + t * 2.5 + Math.PI * 0.5) * amp;
          d.vx = 0; d.vy = 0; continue;
        } else if (eff === "noise") {
          const scale = 0.008, speed = 1.2;
          const angle = noise2(d.ox * scale + t * speed, d.oy * scale) * Math.PI * 4;
          const force = p.repelStrength * 0.08 * dt;
          fx += Math.cos(angle) * force; fy += Math.sin(angle) * force;
        } else if (eff === "vortex") {
          if (dist < p.repelRadius && dist > 0.5) {
            const tt = 1 - dist / p.repelRadius, force = tt * tt * p.repelStrength * 0.6 * dt;
            // Tangential: perpendicular to (dx, dy)
            fx += (-dy / dist) * force; fy += (dx / dist) * force;
          }
        } else if (eff === "breathe") {
          const amp = p.repelStrength * 0.35;
          const phase = t * 1.8;
          d.x = d.ox + Math.sin(phase + d.oy * 0.012) * amp;
          d.y = d.oy + Math.cos(phase + d.ox * 0.012) * amp;
          d.vx = 0; d.vy = 0; continue;
        }
        d.vx = (d.vx + fx) * Math.pow(DAMPING, dt); d.vy = (d.vy + fy) * Math.pow(DAMPING, dt);
        d.x += d.vx; d.y += d.vy;
      }
      drawDots(ctx, previewDotsRef.current, p, w, h);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, mode, videoRender, hasMedia, canvasSize]);

  /* ── Preview: ASCII with canvas-transform effects ── */
  useEffect(() => {
    if (tab !== "preview" || !hasMedia || !isAscii) return;
    const canvas = previewCanvasRef.current; if (!canvas) return;
    const { w, h } = canvasSizeRef.current; canvas.width = w; canvas.height = h;
    const ap = asciiParamsRef.current; const interval = 1000 / videoFps;
    let fidx = 0, lastT = 0, t = 0, prevTime = 0;
    if (mode === "ascii" && imageRef.current) renderImageAscii(imageRef.current, ap, bgEraseRef.current);
    else { const f = asciiFramesRef.current[0]; if (f) renderAsciiToCanvas(canvas, f, { ...ap, transparentBg: bgEraseRef.current }, w, h); }
    const loop = (time: number) => {
      const dt = Math.min((time - prevTime) / 16.67, 2); prevTime = time; t += 0.016 * dt;
      if (isVideo && asciiFramesRef.current.length > 1 && time - lastT >= interval) {
        lastT = time; fidx = (fidx + 1) % asciiFramesRef.current.length;
        const f = asciiFramesRef.current[fidx];
        if (f) renderAsciiToCanvas(canvas, f, { ...asciiParamsRef.current, transparentBg: bgEraseRef.current }, w, h);
      } else if (!isVideo) {
        const f = asciiFramesRef.current[0];
        if (f) renderAsciiToCanvas(canvas, f, { ...asciiParamsRef.current, transparentBg: bgEraseRef.current }, w, h);
      }

      // Apply canvas-level transform based on effect
      const eff = effectRef.current;
      const mouse = mouseRef.current;
      const amp = 6;
      if (eff === "wave") {
        canvas.style.transform = `translate(${Math.sin(t * 2.5) * amp}px, ${Math.cos(t * 1.8) * amp * 0.6}px)`;
      } else if (eff === "breathe") {
        const s = 1 + Math.sin(t * 1.8) * 0.015;
        canvas.style.transform = `scale(${s})`;
      } else if (eff === "noise") {
        const nx = Math.sin(t * 7.3) * amp * 0.5, ny = Math.cos(t * 5.7) * amp * 0.5;
        canvas.style.transform = `translate(${nx}px,${ny}px)`;
      } else if (eff === "vortex" || eff === "repel" || eff === "attract") {
        // Subtle cursor-reactive canvas tilt
        const cx = w / 2, cy = h / 2;
        const dx = (mouse.x - cx) / cx, dy = (mouse.y - cy) / cy;
        const sign = eff === "attract" ? -1 : 1;
        canvas.style.transform = `rotate(${dx * dy * sign * 1.2}deg) translate(${dx * sign * amp * 0.4}px,${dy * sign * amp * 0.4}px)`;
      } else {
        canvas.style.transform = "";
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(rafRef.current); canvas.style.transform = ""; };
    // eslint-disable-next-line react-hooks/exhaustive-deps

  }, [tab, mode, videoRender, hasMedia, canvasSize]);

  const handlePreviewMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseRef.current = {
      x: (e.clientX - rect.left) * ((previewCanvasRef.current?.width ?? 1) / rect.width),
      y: (e.clientY - rect.top) * ((previewCanvasRef.current?.height ?? 1) / rect.height),
    };
  }, []);

  const togglePlay = useCallback(() => {
    const next = !videoPlaying; videoPlayingRef.current = next; setVideoPlaying(next);
  }, [videoPlaying]);

  /* ── Exports ── */
  const exportJSON = useCallback(() => {
    const clean = (d: DotCoord) => ({ x: Math.round(d.x), y: Math.round(d.y), r: +d.r.toFixed(2), ...(d.cr !== undefined ? { cr: d.cr, cg: d.cg, cb: d.cb } : {}) });
    const data = isVideo ? JSON.stringify(ditherFramesRef.current.map(f => f.map(clean)), null, 2) : JSON.stringify(dotsRef.current.map(clean), null, 2);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    a.download = `${mediaName.replace(/\.[^.]+$/, "") || "dither"}-dots.json`; a.click();
  }, [mediaName, isVideo, dotsRef]);

  const copyJSON = useCallback(() => {
    const clean = (d: DotCoord) => ({ x: Math.round(d.x), y: Math.round(d.y), r: +d.r.toFixed(2), ...(d.cr !== undefined ? { cr: d.cr, cg: d.cg, cb: d.cb } : {}) });
    navigator.clipboard.writeText(JSON.stringify(dotsRef.current.map(clean)));
    setCopied("json"); setTimeout(() => setCopied(null), 2000);
  }, [dotsRef]);

  const copyCode = useCallback(() => {
    const p = paramsRef.current;
    navigator.clipboard.writeText(generateInteractionCode(dotsRef.current, p.repelRadius, p.repelStrength, bgEraseRef.current));
    setCopied("code"); setTimeout(() => setCopied(null), 2000);
  }, [dotsRef]);

  const copyAsciiCode = useCallback(() => {
    const frames = asciiFramesRef.current; if (!frames.length) return;
    navigator.clipboard.writeText(generateAsciiVideoCode(frames, videoFps, canvasSizeRef.current.w, canvasSizeRef.current.h, asciiParamsRef.current));
    setCopied("ascii"); setTimeout(() => setCopied(null), 2000);
  }, [videoFps]);

  const exportPNG = useCallback(() => {
    if (!hasMedia) return;
    const { w, h } = canvasSizeRef.current;
    const exportW = paramsRef.current.exportWidth || w;
    const exportH = paramsRef.current.exportHeight || h;
    const transparent = bgEraseRef.current;

    // Re-render to a fresh canvas — never copy from studioCanvas (has bg baked in)
    const out = document.createElement("canvas");
    out.width = exportW; out.height = exportH;
    const ctx = out.getContext("2d")!;

    if (modeRef.current === "ascii" || (modeRef.current === "video" && videoRenderRef.current === "ascii")) {
      // ASCII: re-render cells with transparentBg flag
      const cells = modeRef.current === "video"
        ? (asciiFramesRef.current[frameIdxRef.current] ?? asciiFramesRef.current[0] ?? [])
        : (() => {
          const img = imageRef.current; if (!img) return [];
          const off = document.createElement("canvas");
          off.width = img.width; off.height = img.height;
          const offCtx = off.getContext("2d", { willReadFrequently: true })!;
          offCtx.clearRect(0, 0, img.width, img.height);
          offCtx.drawImage(img, 0, 0);
          return imageDataToAscii(offCtx.getImageData(0, 0, img.width, img.height), asciiParamsRef.current, exportW, exportH);
        })();
      renderAsciiToCanvas(out, cells, { ...asciiParamsRef.current, transparentBg: transparent }, exportW, exportH);
    } else {
      // Dither dots: re-draw from stored dots
      const dots = modeRef.current === "video"
        ? (ditherFramesRef.current[frameIdxRef.current] ?? ditherFramesRef.current[0] ?? [])
        : dotsRef.current;
      // Scale dots if export size differs
      const scaleX = exportW / w, scaleY = exportH / h;
      const scaledDots = (scaleX !== 1 || scaleY !== 1)
        ? dots.map(d => ({ ...d, x: d.x * scaleX, y: d.y * scaleY }))
        : dots;
      drawDots(ctx, scaledDots, paramsRef.current, exportW, exportH, transparent);
    }

    out.toBlob(blob => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${mediaName.replace(/\.[^.]+$/, "") || "dither"}.png`; a.click();
    }, "image/png");
  }, [mediaName, hasMedia, dotsRef]);

  const exportSVG = useCallback(() => {
    const d = dotsRef.current; if (!d.length) return;
    const { w, h } = canvasSizeRef.current;
    const svg = dotsToSVG(d, w, h, paramsRef.current.dotColor, paramsRef.current.bgColor);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    a.download = `${mediaName.replace(/\.[^.]+$/, "") || "dither"}.svg`; a.click();
  }, [mediaName, dotsRef]);

  const showReactCode = useCallback(() => {
    setCodeModal(generateReactCode(paramsRef.current, asciiParamsRef.current as unknown as Record<string, unknown>, mode, videoRender, bgEraseRef.current));
  }, [mode, videoRender]);

  const exportWebM = useCallback(() => {
    if (!videoFrameCount) return;
    const { w, h } = canvasSizeRef.current;
    const transparent = bgEraseRef.current;

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = w; exportCanvas.height = h;
    const exportCtx = exportCanvas.getContext("2d")!;

    // Prefer VP9 (supports alpha), fall back to VP8, then generic WebM
    const mimeTypes = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    const mimeType = mimeTypes.find(t => MediaRecorder.isTypeSupported(t)) ?? "video/webm";
    const stream = exportCanvas.captureStream(videoFps);
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${mediaName.replace(/\.[^.]+$/, "") || "dither"}.webm`; a.click();
      setExportingWebM(false);
    };

    const isAsciiMode = videoRenderRef.current === "ascii";
    const frameInterval = 1000 / videoFps;
    const totalFrames = isAsciiMode ? asciiFramesRef.current.length : ditherFramesRef.current.length;

    setExportingWebM(true);
    recorder.start(100);

    let fi = 0;
    const renderFrame = () => {
      if (fi >= totalFrames) {
        setTimeout(() => { recorder.stop(); }, 200);
        return;
      }
      if (isAsciiMode) {
        const cells = asciiFramesRef.current[fi] ?? [];
        exportCtx.clearRect(0, 0, w, h);
        renderAsciiToCanvas(exportCanvas, cells, { ...asciiParamsRef.current, transparentBg: transparent }, w, h);
      } else {
        const dots = ditherFramesRef.current[fi] ?? [];
        // For video export with bg erase: use the selected bg color but skip solid fill → dots on dark
        // WebM codec can't encode alpha; draw on explicit bg or clear
        if (transparent) {
          exportCtx.clearRect(0, 0, w, h); // makes it dark/black in WebM
        }
        drawDots(exportCtx, dots, paramsRef.current, w, h, transparent);
      }
      fi++;
      setTimeout(renderFrame, frameInterval);
    };
    renderFrame();
  }, [videoFps, videoFrameCount, mediaName]);

  // Apply a welcome-screen preset id
  const applyWelcomePreset = useCallback((id: string) => {
    const wp = WELCOME_PRESETS[id]; if (!wp) return;
    if (wp.params) {
      const p = { ...DEFAULT_PARAMS, ...wp.params };
      setParams(p); paramsRef.current = p;
    }
    if (wp.ascii) {
      const ap = { ...DEFAULT_ASCII_PARAMS, ...wp.ascii };
      setAsciiParams(ap); asciiParamsRef.current = ap;
    }
    const newRenderEffect = wp.renderEffect;
    setVideoRender(newRenderEffect); videoRenderRef.current = newRenderEffect;
    const newMode = newRenderEffect === "ascii" ? "ascii" : "image";
    setMode(newMode); modeRef.current = newMode;
    if (imageRef.current) {
      if (newRenderEffect === "ascii") renderImageAscii(imageRef.current, asciiParamsRef.current);
      else renderImageDither(imageRef.current, paramsRef.current);
    }
    // Don't hide welcome — let them pick a file after selecting style
  }, [renderImageAscii, renderImageDither]);

  // Draw original on compare canvas whenever compare is shown or frame changes
  useEffect(() => {
    if (!showCompare || !hasMedia) return;
    const canvas = compareCanvasRef.current; if (!canvas) return;
    const { w, h } = canvasSizeRef.current; canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    if (isVideo) {
      const raw = rawFramesRef.current[frameIdxRef.current]; if (raw) ctx.putImageData(raw, 0, 0);
    } else if (imageRef.current) {
      ctx.drawImage(imageRef.current, 0, 0, w, h);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCompare, hasMedia, isVideo, videoCurrentFrame]);

  /* ══════════════════════════════════════════════════════════════ */
  return (
    <div style={{ display: "flex", height: "100dvh", background: "var(--bg)", overflow: "hidden", position: "relative" }}>



      {/* ═══ SIDEBAR ═══ */}
      <div className={`sidebar${isMobile && !sidebarOpen ? " collapsed" : ""}`}
        style={{ width: 268, flexShrink: 0, background: "var(--surface)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Mobile drag handle */}
        <div className="drag-handle" onClick={() => setSidebarOpen(o => !o)} />

        {/* Logo + Theme */}
        <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, background: "linear-gradient(135deg,#9b7ff4,#7c5af0)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>D</span>
              </div>
              <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 600, color: "var(--text)", letterSpacing: "-0.02em" }}>ditherit</span>
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} title="Toggle theme"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 4, borderRadius: 4, display: "flex", alignItems: "center" }}>
                {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
              </button>
              <button onClick={() => { const p = DEFAULT_PARAMS; const ap = DEFAULT_ASCII_PARAMS; setParams(p); setAsciiParams(ap); paramsRef.current = p; asciiParamsRef.current = ap; }} title="Reset"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 4, borderRadius: 4, display: "flex", alignItems: "center" }}>
                <RefreshCw size={12} />
              </button>
            </div>
          </div>
          {hasMedia && (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {isVideo && <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono',monospace", color: "var(--muted)", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 6px" }}><span style={{ color: "var(--accent)" }}>{videoFrameCount}</span> frames</span>}
              {showDots && <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono',monospace", color: "var(--muted)", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 6px" }}><span style={{ color: "var(--accent)" }}>{dotCount.toLocaleString()}</span> dots{isVideo ? "/f" : ""}</span>}
              {(rendering || isLoading) && <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono',monospace", color: "var(--accent)", marginLeft: "auto" }}>{isLoading ? `${Math.round(videoProgress * 100)}%` : "··"}</span>}
            </div>
          )}
        </div>

        {/* Effect selector: Dither | ASCII */}
        <div style={{ flexShrink: 0, borderBottom: "1px solid var(--border)", padding: "10px 12px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}>
            {(["dither", "ascii"] as VideoRender[]).map(v => (
              <button key={v}
                className={videoRender === v ? "btn-primary" : "btn-ghost"}
                style={{ borderRadius: 10, padding: "8px 0", fontSize: 11, fontWeight: 600, width: "100%" }}
                onClick={() => {
                  setVideoRender(v);
                  videoRenderRef.current = v;
                  // Remove bg erase constraint for ascii
                  if (!isVideo) {
                    const newMode = v === "ascii" ? "ascii" : "image";
                    setMode(newMode);
                    modeRef.current = newMode;
                    const img = imageRef.current;
                    if (img) {
                      if (v === "ascii") renderImageAscii(img, asciiParamsRef.current, bgEraseEnabled);
                      else renderImageDither(img, paramsRef.current);
                    }
                  }
                }}>
                {v === "dither" ? "Dither" : "ASCII"}
              </button>
            ))}
          </div>
          <AnimatePresence>
            <motion.div
              key="remove-bg"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              style={{ overflow: "hidden", marginTop: 6 }}
            >
              <button
                onClick={() => setBgEraseEnabled(b => !b)}
                style={{
                  width: "100%", height: 36, display: "flex", alignItems: "center",
                  justifyContent: "center", gap: 7,
                  borderRadius: 10, border: "none", cursor: "pointer", fontSize: 11,
                  fontFamily: "'Inter',sans-serif", fontWeight: 500,
                  background: bgEraseEnabled
                    ? "linear-gradient(to bottom, var(--accent-from), var(--accent-to))"
                    : "var(--row-bg)",
                  color: bgEraseEnabled ? "#fff" : "var(--text)",
                  boxShadow: bgEraseEnabled ? "0px 2px 8px rgba(124,90,240,0.35)" : "none",
                  transition: "all 0.15s",
                }}>
                <Eraser size={11} /> {bgEraseEnabled ? "BG Erase: ON" : "Remove Background"}
              </button>
              <AnimatePresence>
                {bgEraseEnabled && isVideo && (
                  <motion.p
                    key="export-warn"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    style={{ fontSize: 10, color: "var(--muted)", fontFamily: "'JetBrains Mono',monospace", marginTop: 4, paddingLeft: 2, lineHeight: 1.5 }}
                  >
                    ⚠ Transparent export — VP9 only. May show bg in QuickTime/Figma.
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Scrollable controls */}
        <div style={{ overflowY: "auto", flex: 1 }}>

          {showDots && (<>
            <Section title="Characters">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}>
                {ALGORITHMS.map(a => (
                  <button key={a.value} onClick={() => setParamLive("algorithm", a.value)}
                    style={{
                      padding: "7px 4px", fontSize: 10, fontFamily: "'Inter',sans-serif", fontWeight: 500,
                      borderRadius: 6, border: "none", cursor: "pointer",
                      background: params.algorithm === a.value
                        ? "linear-gradient(to bottom, var(--accent-from), var(--accent-to))"
                        : "var(--row-bg)",
                      color: params.algorithm === a.value ? "#fff" : "var(--muted)",
                      boxShadow: params.algorithm === a.value ? "0px 2px 8px rgba(124,90,240,0.3)" : "none",
                      transition: "all 0.15s",
                    }}>{a.label}</button>
                ))}
              </div>
              <Slider label="SPACING" value={params.scale} min={2} max={20} step={1} onChange={v => setParamLive("scale", v)} unit="px" />
              <Slider label="MIN RADIUS" value={params.dotMinRadius} min={0.3} max={4} step={0.1} decimals={1} onChange={v => setParamLive("dotMinRadius", v)} unit="px" />
              <Slider label="MAX RADIUS" value={params.dotMaxRadius} min={0.5} max={8} step={0.1} decimals={1} onChange={v => setParamLive("dotMaxRadius", v)} unit="px" />
            </Section>

            <Section title="Transform">
              <Slider
                label="Scale"
                min={25} max={300} step={5}
                value={Math.round(scale * 100)}
                onChange={v => setScale(v / 100)}
                displayValue={`${Math.round(scale * 100)}%`}
              />
            </Section>

            <Section title="Glyph Overlay" defaultOpen={false}>
              <Toggle label="ENABLE GLYPH LAYER" value={params.glyphOverlay} onChange={v => setParamLive("glyphOverlay", v)} />
              {params.glyphOverlay && (<>
                <Slider label="GLYPH RADIUS" value={params.glyphRadius} min={0.5} max={8} step={0.1} decimals={1} onChange={v => setParamLive("glyphRadius", v)} unit="px" />
                <Slider label="GLYPH SPACING" value={params.glyphSpacing} min={2} max={30} step={1} onChange={v => setParamLive("glyphSpacing", v)} unit="px" />
                <Toggle label="EDGE ONLY" value={params.glyphEdgeOnly} onChange={v => setParamLive("glyphEdgeOnly", v)} />
                {params.glyphEdgeOnly && <Slider label="EDGE THRESHOLD" value={params.glyphEdgeThreshold} min={5} max={200} step={1} onChange={v => setParamLive("glyphEdgeThreshold", v)} />}
              </>)}
            </Section>

            <Section title="Intensity">
              <Slider label="THRESHOLD" value={params.threshold} min={0} max={255} step={1} onChange={v => setParamLive("threshold", v)} />
              <Slider label="CONTRAST" value={params.contrast} min={-100} max={100} step={1} onChange={v => setParamLive("contrast", v)} />
              <Slider label="BRIGHTNESS" value={params.brightness} min={-100} max={100} step={1} onChange={v => setParamLive("brightness", v)} />
              <Slider label="GAMMA" value={params.gamma} min={0.2} max={3} step={0.05} decimals={2} onChange={v => setParamLive("gamma", v)} />
              <Slider label="BLUR" value={params.blur} min={0} max={5} step={0.1} decimals={1} onChange={v => setParamLive("blur", v)} />
              <Slider label="HIGHLIGHTS" value={params.highlightCompression} min={0} max={1} step={0.01} decimals={2} onChange={v => setParamLive("highlightCompression", v)} />
              <Slider label="ERROR STR." value={params.errorStrength} min={0} max={1} step={0.01} decimals={2} onChange={v => setParamLive("errorStrength", v)} />
              <Toggle label="SERPENTINE" value={params.serpentine} onChange={v => setParamLive("serpentine", v)} />
              <Toggle label="INVERT" value={params.invert} onChange={v => setParamLive("invert", v)} />
            </Section>

            <Section title="Background">
              <ColorRow label="BACKGROUND" value={params.bgColor} onChange={v => setParamLive("bgColor", v)} />
              <Toggle label="SOURCE COLORS" value={params.useSourceColor} onChange={v => setParamLive("useSourceColor", v)} />
              {!params.useSourceColor && <ColorRow label="DOTS" value={params.dotColor} onChange={v => setParamLive("dotColor", v)} />}
            </Section>

            <Section title="Color Overlay" defaultOpen={false}>
              <ColorRow label="TINT COLOR" value={params.overlayColor} onChange={v => setParamLive("overlayColor", v)} />
              <Slider label="OPACITY" value={params.overlayOpacity} min={0} max={1} step={0.01} decimals={2} onChange={v => setParamLive("overlayOpacity", v)} />
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ color: "var(--muted)", fontSize: 9, fontFamily: "'Inter',sans-serif", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", padding: "4px 0 2px" }}>BLEND MODE</span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}>
                  {BLEND_MODES.map(b => (
                    <button key={b.value} onClick={() => setParamLive("blendMode", b.value)}
                      style={{
                        padding: "7px 4px", fontSize: 9, fontFamily: "'Inter',sans-serif",
                        borderRadius: 10, border: "none", cursor: "pointer",
                        background: params.blendMode === b.value
                          ? "linear-gradient(to bottom, var(--accent-from), var(--accent-to))"
                          : "var(--row-bg)",
                        color: params.blendMode === b.value ? "#fff" : "var(--muted)",
                        boxShadow: params.blendMode === b.value ? "0px 2px 8px rgba(124,90,240,0.3)" : "none",
                        transition: "all 0.15s",
                      }}>{b.label}</button>
                  ))}
                </div>
              </div>
            </Section>

            <Section title="Repulsion">
              <Slider label="RADIUS" value={params.repelRadius} min={20} max={200} step={1} onChange={v => setParamLive("repelRadius", v)} unit="px" />
              <Slider label="STRENGTH" value={params.repelStrength} min={5} max={200} step={1} onChange={v => setParamLive("repelStrength", v)} unit="px" />
            </Section>

            <Section title="Resolution" defaultOpen={false}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ color: "var(--muted)", fontSize: 10, fontFamily: "'JetBrains Mono',monospace" }}>WIDTH</span>
                  <input type="number" value={params.exportWidth} min={100} max={4000}
                    onChange={e => { const w = Math.max(100, Math.min(4000, parseInt(e.target.value) || 100)); setParamLive("exportWidth", w); if (params.lockAspect && canvasSizeRef.current.w > 0) setParamLive("exportHeight", Math.round(w * (canvasSizeRef.current.h / canvasSizeRef.current.w))); }}
                    style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", padding: "5px 8px", fontSize: 11, fontFamily: "'JetBrains Mono',monospace", borderRadius: 6, outline: "none", width: "100%" }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ color: "var(--muted)", fontSize: 10, fontFamily: "'JetBrains Mono',monospace" }}>HEIGHT</span>
                  <input type="number" value={params.exportHeight} min={100} max={4000}
                    onChange={e => { const h = Math.max(100, Math.min(4000, parseInt(e.target.value) || 100)); setParamLive("exportHeight", h); if (params.lockAspect && canvasSizeRef.current.h > 0) setParamLive("exportWidth", Math.round(h * (canvasSizeRef.current.w / canvasSizeRef.current.h))); }}
                    style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", padding: "5px 8px", fontSize: 11, fontFamily: "'JetBrains Mono',monospace", borderRadius: 6, outline: "none", width: "100%" }} />
                </div>
              </div>
              <Toggle label="LOCK ASPECT" value={params.lockAspect} onChange={v => setParamLive("lockAspect", v)} />
            </Section>
          </>)}

          {(mode === "ascii" || (isVideo && videoRender === "ascii")) && (<>
            <Section title="Characters">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}>
                {ASCII_CHARSET_OPTS.map(o => (
                  <button key={o.value} onClick={() => setAsciiParamLive("charset", o.value)}
                    style={{
                      padding: "7px 4px", fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
                      borderRadius: 10, border: "none", cursor: "pointer",
                      background: asciiParams.charset === o.value
                        ? "linear-gradient(to bottom, var(--accent-from), var(--accent-to))"
                        : "var(--row-bg)",
                      color: asciiParams.charset === o.value ? "#fff" : "var(--muted)",
                      boxShadow: asciiParams.charset === o.value ? "0px 2px 8px rgba(124,90,240,0.3)" : "none",
                      transition: "all 0.15s",
                    }}>{o.label}</button>
                ))}
              </div>
              {asciiParams.charset === "custom" && (
                <input value={asciiParams.customCharset} onChange={e => setAsciiParamLive("customCharset", e.target.value)} placeholder="@#%+:. "
                  style={{ background: "var(--row-bg)", border: "1px solid var(--row-divider)", color: "var(--text)", padding: "6px 10px", fontSize: 11, fontFamily: "'JetBrains Mono',monospace", borderRadius: 10, outline: "none", width: "100%" }} />
              )}
            </Section>
            <Section title="Type &amp; Spacing">
              <Slider label="FONT SIZE" value={asciiParams.fontSize} min={4} max={24} step={1} onChange={v => setAsciiParamLive("fontSize", v)} unit="px" />
              <Slider label="CHAR SPACING" value={asciiParams.charSpacing} min={0.4} max={2.0} step={0.05} decimals={2} onChange={v => setAsciiParamLive("charSpacing", v)} unit="×" />
              <Slider label="LINE SPACING" value={asciiParams.lineSpacing} min={0.8} max={2.5} step={0.05} decimals={2} onChange={v => setAsciiParamLive("lineSpacing", v)} unit="×" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 3 }}>
                {(["monospace", "courier", "consolas"] as const).map(f => (
                  <button key={f} onClick={() => setAsciiParamLive("fontFamily", f)}
                    style={{
                      padding: "7px 4px", fontSize: 9, fontFamily: f,
                      borderRadius: 6, border: "none", cursor: "pointer",
                      background: asciiParams.fontFamily === f
                        ? "linear-gradient(to bottom, var(--accent-from), var(--accent-to))"
                        : "var(--row-bg)",
                      color: asciiParams.fontFamily === f ? "#fff" : "var(--muted)",
                      boxShadow: asciiParams.fontFamily === f ? "0px 2px 8px rgba(124,90,240,0.3)" : "none",
                      transition: "all 0.15s",
                      textTransform: "capitalize",
                    }}>{f}</button>
                ))}
              </div>
            </Section>
            <Section title="Tone">
              <Slider label="CONTRAST" value={asciiParams.contrast} min={-100} max={100} step={1} onChange={v => setAsciiParamLive("contrast", v)} />
              <Slider label="BRIGHTNESS" value={asciiParams.brightness} min={-100} max={100} step={1} onChange={v => setAsciiParamLive("brightness", v)} />
              <Slider label="GAMMA" value={asciiParams.gamma} min={0.2} max={3} step={0.05} decimals={2} onChange={v => setAsciiParamLive("gamma", v)} />
              <Toggle label="INVERT" value={asciiParams.invertBrightness} onChange={v => setAsciiParamLive("invertBrightness", v)} />
            </Section>
            <Section title="Colors &amp; Glow">
              <Toggle label="SOURCE COLORS" value={asciiParams.colored} onChange={v => setAsciiParamLive("colored", v)} />
              {!asciiParams.colored && <ColorRow label="CHARACTERS" value={asciiParams.fgColor} onChange={v => setAsciiParamLive("fgColor", v)} />}
              <ColorRow label="BACKGROUND" value={asciiParams.bgColor} onChange={v => setAsciiParamLive("bgColor", v)} />

              <Toggle label="NEON GLOW" value={asciiParams.glow} onChange={v => setAsciiParamLive("glow", v)} />
              {asciiParams.glow && (<>
                <ColorRow label="GLOW COLOR" value={asciiParams.glowColor} onChange={v => setAsciiParamLive("glowColor", v)} />
                <Slider label="GLOW RADIUS" value={asciiParams.glowRadius} min={1} max={20} step={1} onChange={v => setAsciiParamLive("glowRadius", v)} unit="px" />
              </>)}
            </Section>
          </>)}

          {isVideo && (
            <Section title="Video">
              <Slider label="EXTRACT FPS" value={videoFps} min={6} max={60} step={1} onChange={setVideoFps} unit="fps" />
              <p style={{ fontSize: 9, color: "var(--muted)", fontFamily: "'JetBrains Mono',monospace", lineHeight: 1.6 }}>Re-upload to apply FPS change.</p>
            </Section>
          )}
        </div>

        {/* Export panel */}
        <div style={{ padding: "12px 12px 14px", borderTop: "1px solid var(--border)", flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "grid", gridTemplateColumns: showDots ? "1fr 1fr" : "1fr", gap: 6 }}>
            {showDots && (
              <button onClick={exportJSON} disabled={!hasMedia} className="btn-primary" style={{ borderRadius: 8, padding: "7px 10px", fontSize: 10 }}>
                <Download size={11} /> Export JSON
              </button>
            )}
            <button onClick={exportPNG} disabled={!hasMedia} className={showDots ? "btn-ghost" : "btn-primary"} style={{ borderRadius: 8, padding: "7px 10px", fontSize: 10 }}>
              <Download size={11} /> Export PNG
            </button>
          </div>
          {showDots && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <button onClick={copyJSON} disabled={!hasMedia} className="btn-ghost" style={{ borderRadius: 8, padding: "7px 10px", fontSize: 10 }}>
                {copied === "json" ? <Check size={11} /> : <Copy size={11} />} {copied === "json" ? "Copied!" : "Copy JSON"}
              </button>
              <button onClick={copyCode} disabled={!hasMedia} className="btn-ghost" style={{ borderRadius: 8, padding: "7px 10px", fontSize: 10 }}>
                {copied === "code" ? <Check size={11} /> : <Code size={11} />} {copied === "code" ? "Copied!" : "Copy JS"}
              </button>
            </div>
          )}
          {isAscii && (
            <button onClick={copyAsciiCode} disabled={!hasMedia} className="btn-ghost" style={{ borderRadius: 8, padding: "7px 10px", fontSize: 10, width: "100%" }}>
              {copied === "ascii" ? <Check size={11} /> : <Code size={11} />} {copied === "ascii" ? "Copied!" : "Copy ASCII Player JS"}
            </button>
          )}
          {showDots && (
            <button onClick={exportSVG} disabled={!hasMedia} className="btn-ghost" style={{ borderRadius: 8, padding: "7px 10px", fontSize: 10, width: "100%" }}>
              <Download size={11} /> Export SVG
            </button>
          )}
          {videoFrameCount > 0 && (
            <button onClick={exportWebM} disabled={!hasMedia || exportingWebM} className="btn-ghost" style={{ borderRadius: 8, padding: "7px 10px", fontSize: 10, width: "100%" }}>
              <FileVideo size={11} /> {exportingWebM ? "Recording…" : "Export WebM"}
            </button>
          )}
          <button onClick={showReactCode} disabled={!hasMedia} className="btn-primary" style={{ borderRadius: 8, padding: "7px 10px", fontSize: 10, width: "100%" }}>
            <Code size={11} /> Copy React Code
          </button>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Tab bar — 3-zone layout: [tabs] [contextual center flex:1] [compare btn] [github] */}
        <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--border)", padding: "0 12px 0 0", flexShrink: 0, height: 44 }}>
          {/* LEFT: Studio | Preview tabs */}
          <div style={{ display: "flex", height: "100%", alignItems: "center" }}>
            {(["studio", "preview"] as Tab[]).map(t => (
              <button key={t} onClick={() => { setTab(t); if (t === "preview" && isMobile) setSidebarOpen(false); }}
                style={{ padding: "0 14px", height: "100%", fontSize: 11, fontFamily: "'Inter',sans-serif", fontWeight: 500, background: "none", border: "none", borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent", color: tab === t ? "var(--text)" : "var(--muted)", cursor: "pointer", transition: "color 0.15s", textTransform: "capitalize", display: "flex", alignItems: "center", gap: 5 }}>
                {t}
              </button>
            ))}
          </div>
          {/* CENTER: contextual info */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {isVideo && hasMedia && !isLoading && tab === "studio" && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono',monospace", color: "var(--muted)" }}>{videoCurrentFrame + 1}/{videoFrameCount}</span>
                <button onClick={togglePlay} className="btn-ghost" style={{ borderRadius: 8, padding: "5px 12px", fontSize: 10 }}>
                  {videoPlaying ? <Pause size={11} /> : <Play size={11} />} {videoPlaying ? "Pause" : "Play"}
                </button>
              </div>
            )}
            {tab === "preview" && hasMedia && (
              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                {(["repel", "attract", "wave", "noise", "vortex", "breathe"] as const).map(e => (
                  <button key={e} onClick={() => setEffect(e)}
                    className={`btn-chip${effect === e ? " active" : ""}`}
                    style={{ fontSize: 9, padding: "3px 8px", textTransform: "capitalize" }}>
                    {e === "noise" ? "Noise" : e === "repel" ? "Repel" : e === "attract" ? "Attract" : e === "wave" ? "Wave" : e === "vortex" ? "Vortex" : "Breathe"}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* RIGHT: Compare toggle + Socials */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {hasMedia && (
              <button onClick={() => { setShowCompare(c => !c); if (!showCompare) setTab("studio"); }}
                style={{ display: "flex", alignItems: "center", gap: 4, background: showCompare ? "var(--accent)" : "var(--surface2)", border: `1px solid ${showCompare ? "var(--accent)" : "var(--border)"}`, borderRadius: 6, padding: "4px 9px", cursor: "pointer", transition: "all 0.15s" }}>
                <Columns2 size={11} color={showCompare ? "#fff" : "var(--muted)"} />
                <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono',monospace", color: showCompare ? "#fff" : "var(--muted)" }}>Compare</span>
              </button>
            )}
            <a href="https://github.com/prasanjit-dey-ux/ditherit" target="_blank" rel="noopener noreferrer"
              title="Star on GitHub"
              style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 9px", textDecoration: "none", cursor: "pointer", transition: "border-color 0.15s, background 0.15s", flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--border-hover)"; e.currentTarget.style.background = "var(--surface)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--surface2)"; }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ color: "var(--muted)" }}>
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12" />
              </svg>
              <span style={{ color: "var(--text)", fontSize: 11, fontFamily: "'JetBrains Mono',monospace", fontWeight: 500 }}>GitHub</span>
              <span style={{ display: "flex", alignItems: "center", gap: 3, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 6px" }}>
                <Star size={9} color="#f5a623" fill="#f5a623" />
                <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "'JetBrains Mono',monospace" }}>{githubStars !== null ? githubStars.toLocaleString() : "–"}</span>
              </span>
            </a>

            <a href="https://x.com/Prasanjit_ui" target="_blank" rel="noopener noreferrer"
              title="Follow on X"
              style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 9px", textDecoration: "none", cursor: "pointer", transition: "border-color 0.15s, background 0.15s", flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--border-hover)"; e.currentTarget.style.background = "var(--surface)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--surface2)"; }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ color: "var(--muted)" }}>
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <span style={{ color: "var(--text)", fontSize: 11, fontFamily: "'JetBrains Mono',monospace", fontWeight: 500 }}>Twitter</span>
            </a>
          </div>
        </div>

        {/* Canvas area */}
        {showCompare && hasMedia ? (
          /* ── Compare split view ── */
          <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}
            onPointerMove={e => {
              if (!isDraggingSplitRef.current) return;
              const rect = e.currentTarget.getBoundingClientRect();
              setSplitRatio(Math.max(0.1, Math.min(0.9, (e.clientX - rect.left) / rect.width)));
            }}
            onPointerUp={() => { isDraggingSplitRef.current = false; }}>
            <div style={{ width: `${splitRatio * 100}%`, flexShrink: 0, background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}>
              <span style={{ position: "absolute", top: 8, left: 8, fontSize: 9, fontFamily: "'JetBrains Mono',monospace", color: "var(--muted)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 6px", zIndex: 2 }}>ORIGINAL</span>
              <canvas ref={compareCanvasRef} style={{ maxWidth: "100%", maxHeight: "100%" }} />
            </div>
            <div onPointerDown={e => { isDraggingSplitRef.current = true; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
              style={{ width: 4, background: "var(--accent)", cursor: "ew-resize", flexShrink: 0, zIndex: 10, position: "relative" }}>
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 20, height: 20, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M8 12H16M4 12L8 8M4 12L8 16M20 12L16 8M20 12L16 16" /></svg>
              </div>
            </div>
            <div style={{ flex: 1, background: canBg, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}>
              <span style={{ position: "absolute", top: 8, right: 8, fontSize: 9, fontFamily: "'JetBrains Mono',monospace", color: "var(--muted)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 6px", zIndex: 2 }}>DITHERED</span>
              <canvas ref={studioCanvasRef} style={{ maxWidth: "100%", maxHeight: "100%" }} />
            </div>
          </div>
        ) : (
          /* ── Normal canvas area ── */
          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            background: bgEraseEnabled
              ? `repeating-conic-gradient(#888 0% 25%, #555 0% 50%) 0 0 / 16px 16px`
              : canBg,
            overflow: "hidden", position: "relative"
          }}>

            <canvas ref={studioCanvasRef} style={{ display: tab === "studio" ? "block" : "none", maxWidth: "100%", maxHeight: "100%" }} />
            <canvas ref={previewCanvasRef}
              onMouseMove={handlePreviewMouseMove}
              onMouseLeave={() => { mouseRef.current = { x: -9999, y: -9999 }; }}
              onTouchMove={e => {
                const rect = e.currentTarget.getBoundingClientRect();
                const touch = e.touches[0];
                mouseRef.current = {
                  x: (touch.clientX - rect.left) * ((previewCanvasRef.current?.width ?? 1) / rect.width),
                  y: (touch.clientY - rect.top) * ((previewCanvasRef.current?.height ?? 1) / rect.height),
                };
              }}
              onTouchEnd={() => { mouseRef.current = { x: -9999, y: -9999 }; }}
              style={{ display: tab === "preview" ? "block" : "none", maxWidth: "100%", maxHeight: "100%", cursor: !isAscii && !isMobile ? "none" : "default", touchAction: "none" }} />

            {!hasMedia && !isLoading && (
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", gap: 16, zIndex: 10, background: dragging ? "rgba(124,90,240,0.05)" : "transparent", border: dragging ? "2px dashed var(--accent)" : "2px dashed transparent", transition: "all 0.15s" }}>
                <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--surface)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {isVideo ? <Film size={28} color="var(--muted)" /> : mode === "ascii" ? <Type size={28} color="var(--muted)" /> : <Upload size={28} color="var(--muted)" />}
                </div>
                <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
                  <p style={{ color: "var(--text)", fontFamily: "'Inter',sans-serif", fontWeight: 500, fontSize: 14 }}>Drop anything</p>
                  <p style={{ color: "var(--muted)", fontSize: 12 }}>Image · Video · GIF — auto-detected</p>
                  <div className="btn-primary" style={{ marginTop: 4, borderRadius: 10, padding: "8px 20px", fontSize: 12, pointerEvents: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Upload size={12} /> Browse files
                  </div>
                </div>
              </div>
            )}

            {isLoading && (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, background: "var(--bg)" }}>
                <div style={{ width: 260, height: 2, background: "var(--border)", borderRadius: 1, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${videoProgress * 100}%`, background: "linear-gradient(to right,#9b7ff4,#7c5af0)", transition: "width 0.2s", borderRadius: 1 }} />
                </div>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "var(--muted)" }}>{progressLabel}</span>
              </div>
            )}

            {hasMedia && !isLoading && (
              <button onClick={() => fileInputRef.current?.click()}
                style={{ position: "absolute", bottom: 14, right: 14, cursor: "pointer", zIndex: 20, background: "none", border: "none", padding: 0 }}>
                <span className="btn-ghost" style={{ borderRadius: 8, padding: "6px 14px", fontSize: 10, display: "inline-flex", alignItems: "center", gap: 5, backdropFilter: "blur(8px)" }}>
                  <Upload size={10} /> Change {isVideo ? "video" : "image"}
                </span>
              </button>
            )}

            {tab === "preview" && !hasMedia && (
              <p style={{ color: "var(--muted)", fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>Load media in Studio first</p>
            )}
          </div>
        )}
      </div>


      <input ref={fileInputRef} id="dither-file-input" type="file"
        accept="image/*,image/gif,video/*,video/mp4,video/webm,video/quicktime"
        style={{ position: "fixed", bottom: 0, right: 0, opacity: 0, width: 0, height: 0, pointerEvents: "none" }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />


      {codeModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          onClick={() => setCodeModal(null)}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 24, maxWidth: 700, width: "100%", maxHeight: "80vh", display: "flex", flexDirection: "column", gap: 12 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "'Inter',sans-serif", fontWeight: 600, fontSize: 14, color: "var(--text)" }}>React Code</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn-primary" style={{ borderRadius: 8, padding: "6px 14px", fontSize: 11 }}
                  onClick={() => { if (codeModal) navigator.clipboard.writeText(codeModal); setCopied("react"); setTimeout(() => setCopied(null), 2000); }}>
                  {copied === "react" ? <Check size={11} /> : <Copy size={11} />} {copied === "react" ? "Copied!" : "Copy"}
                </button>
                <button className="btn-ghost" style={{ borderRadius: 8, padding: "6px 14px", fontSize: 11 }} onClick={() => setCodeModal(null)}>Close</button>
              </div>
            </div>
            <pre style={{ overflowY: "auto", flex: 1, background: "var(--surface2)", borderRadius: 8, padding: 16, fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: "var(--text)", margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {codeModal}
            </pre>
            <p style={{ fontSize: 10, color: "var(--muted)", fontFamily: "'JetBrains Mono',monospace" }}>npm install ditherit-react</p>
          </div>
        </div>
      )}
    </div>
  );
}
