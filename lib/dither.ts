export interface DotCoord {
  x: number;
  y: number;
  r: number;
  cr?: number; cg?: number; cb?: number; // source color
}

export type BlendMode =
  | "normal" | "multiply" | "screen" | "overlay"
  | "soft-light" | "hard-light" | "color-dodge" | "color-burn"
  | "hue" | "saturation" | "luminosity" | "difference";

export interface DitherParams {
  // Algorithm
  algorithm: "floyd-steinberg" | "atkinson" | "ordered" | "threshold";
  serpentine: boolean;
  errorStrength: number;
  invert: boolean;
  // Grid
  scale: number;
  dotMinRadius: number;
  dotMaxRadius: number;
  // Tone (Intensity)
  threshold: number;
  contrast: number;
  brightness: number;
  gamma: number;
  blur: number;
  highlightCompression: number;
  cornerRadius: number;
  // Colors / Background
  bgColor: string;
  dotColor: string;
  useSourceColor: boolean;
  // Color overlay
  overlayColor: string;
  overlayOpacity: number;   // 0–1
  blendMode: BlendMode;
  // Glyph overlay (edge-based dot layer)
  glyphOverlay: boolean;
  glyphRadius: number;       // 1–8
  glyphSpacing: number;      // 2–20
  glyphEdgeOnly: boolean;    // constrain to detected edges
  glyphEdgeThreshold: number;// 0–255
  // Repulsion
  repelRadius: number;
  repelStrength: number;
  // Export resolution
  exportWidth: number;
  exportHeight: number;
  lockAspect: boolean;
}

export const DEFAULT_PARAMS: DitherParams = {
  algorithm: "floyd-steinberg",
  serpentine: true,
  errorStrength: 0.85,
  invert: false,
  scale: 2,
  dotMinRadius: 1,
  dotMaxRadius: 2.5,
  threshold: 128,
  contrast: 20,
  brightness: 0,
  gamma: 1.2,
  blur: 0.5,
  highlightCompression: 0.1,
  cornerRadius: 0,
  bgColor: "#0a0a0a",
  dotColor: "#ffffff",
  useSourceColor: false,
  overlayColor: "#7c5af0",
  overlayOpacity: 0,
  blendMode: "normal",
  glyphOverlay: false,
  glyphRadius: 1.5,
  glyphSpacing: 8,
  glyphEdgeOnly: true,
  glyphEdgeThreshold: 40,
  repelRadius: 80,
  repelStrength: 60,
  exportWidth: 600,
  exportHeight: 600,
  lockAspect: true,
};

export const BLEND_MODES: { value: BlendMode; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "multiply", label: "Multiply" },
  { value: "screen", label: "Screen" },
  { value: "overlay", label: "Overlay" },
  { value: "soft-light", label: "Soft Light" },
  { value: "hard-light", label: "Hard Light" },
  { value: "color-dodge", label: "Color Dodge" },
  { value: "color-burn", label: "Color Burn" },
  { value: "hue", label: "Hue" },
  { value: "saturation", label: "Saturation" },
  { value: "luminosity", label: "Luminosity" },
  { value: "difference", label: "Difference" },
];

const BAYER_8x8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

function clamp(v: number, min = 0, max = 255) { return Math.max(min, Math.min(max, v)); }
function applyContrast(v: number, c: number) { return clamp((259 * (c + 255)) / (255 * (259 - c)) * (v - 128) + 128); }
function applyGamma(v: number, g: number) { return clamp(Math.pow(v / 255, 1 / g) * 255); }
function applyBrightness(v: number, b: number) { return clamp(v + b); }
function applyHC(v: number, hc: number) { if (!hc) return v; const t = v / 255; return clamp((t - hc * t * t) * 255); }

function boxBlur(data: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 0.5) return data;
  const ir = Math.max(1, Math.round(r)), size = 2 * ir + 1;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let s = 0; for (let x = -ir; x <= ir; x++) s += data[y * w + clamp(x, 0, w - 1)];
    for (let x = 0; x < w; x++) { tmp[y * w + x] = s / size; s += data[y * w + clamp(x + ir + 1, 0, w - 1)] - data[y * w + clamp(x - ir, 0, w - 1)]; }
  }
  for (let x = 0; x < w; x++) {
    let s = 0; for (let y = -ir; y <= ir; y++) s += tmp[clamp(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) { out[y * w + x] = s / size; s += tmp[clamp(y + ir + 1, 0, h - 1) * w + x] - tmp[clamp(y - ir, 0, h - 1) * w + x]; }
  }
  return out;
}

// Sobel edge detection — returns edge magnitude 0-255 per pixel
function sobelEdge(gray: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const tl = gray[(y - 1) * w + (x - 1)], t = gray[(y - 1) * w + x], tr = gray[(y - 1) * w + (x + 1)];
      const ml = gray[y * w + (x - 1)], mr = gray[y * w + (x + 1)];
      const bl = gray[(y + 1) * w + (x - 1)], b = gray[(y + 1) * w + x], br = gray[(y + 1) * w + (x + 1)];
      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
      const gy = -tl - 2 * t - tr + bl + 2 * b + br;
      out[y * w + x] = clamp(Math.sqrt(gx * gx + gy * gy));
    }
  }
  return out;
}

export function ditherImage(
  imageData: ImageData,
  params: DitherParams,
  outputWidth: number,
  outputHeight: number
): DotCoord[] {
  const { width: iw, height: ih } = imageData;
  const src = imageData.data;

  // Grayscale
  let gray: Float32Array = new Float32Array(iw * ih);
  for (let i = 0; i < iw * ih; i++) {
    const r = src[i * 4], g = src[i * 4 + 1], b = src[i * 4 + 2], a = src[i * 4 + 3] / 255;
    gray[i] = (0.299 * r + 0.587 * g + 0.114 * b) * a + 255 * (1 - a);
  }
  for (let i = 0; i < gray.length; i++) {
    let v = gray[i];
    v = applyBrightness(v, params.brightness);
    v = applyContrast(v, params.contrast);
    v = applyGamma(v, params.gamma);
    v = applyHC(v, params.highlightCompression);
    gray[i] = v;
  }
  gray = boxBlur(gray, iw, ih, params.blur);
  if (params.invert) for (let i = 0; i < gray.length; i++) gray[i] = 255 - gray[i];

  const dots: DotCoord[] = [];
  const sx = iw / outputWidth, sy = ih / outputHeight;
  const step = params.scale;

  const sampleColor = (ox: number, oy: number) => params.useSourceColor ? {
    cr: src[(clamp(Math.floor(oy * sy), 0, ih - 1) * iw + clamp(Math.floor(ox * sx), 0, iw - 1)) * 4],
    cg: src[(clamp(Math.floor(oy * sy), 0, ih - 1) * iw + clamp(Math.floor(ox * sx), 0, iw - 1)) * 4 + 1],
    cb: src[(clamp(Math.floor(oy * sy), 0, ih - 1) * iw + clamp(Math.floor(ox * sx), 0, iw - 1)) * 4 + 2],
  } : undefined;

  if (params.algorithm === "ordered") {
    for (let oy = 0; oy < outputHeight; oy += step) for (let ox = 0; ox < outputWidth; ox += step) {
      const v = gray[clamp(Math.floor(oy * sy), 0, ih - 1) * iw + clamp(Math.floor(ox * sx), 0, iw - 1)];
      if (v < (BAYER_8x8[oy % 8][ox % 8] / 64) * 255) {
        const i = 1 - v / 255, rad = params.dotMinRadius + i * (params.dotMaxRadius - params.dotMinRadius);
        dots.push({ x: ox, y: oy, r: rad, ...sampleColor(ox, oy) });
      }
    }
  } else if (params.algorithm === "threshold") {
    for (let oy = 0; oy < outputHeight; oy += step) for (let ox = 0; ox < outputWidth; ox += step) {
      const v = gray[clamp(Math.floor(oy * sy), 0, ih - 1) * iw + clamp(Math.floor(ox * sx), 0, iw - 1)];
      if (v < params.threshold) {
        const i = 1 - v / 255, rad = params.dotMinRadius + i * (params.dotMaxRadius - params.dotMinRadius);
        dots.push({ x: ox, y: oy, r: rad, ...sampleColor(ox, oy) });
      }
    }
  } else {
    const gw = Math.ceil(outputWidth / step), gh = Math.ceil(outputHeight / step);
    const buf = new Float32Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      const px = clamp(Math.floor(gx * step * sx), 0, iw - 1), py = clamp(Math.floor(gy * step * sy), 0, ih - 1);
      buf[gy * gw + gx] = gray[py * iw + px];
    }
    const es = params.errorStrength;
    for (let gy = 0; gy < gh; gy++) {
      const fwd = params.serpentine && gy % 2 === 1;
      const xS = fwd ? gw - 1 : 0, xE = fwd ? -1 : gw, xD = fwd ? -1 : 1;
      for (let gx = xS; gx !== xE; gx += xD) {
        const i = gy * gw + gx, old = buf[i], nv = old < params.threshold ? 0 : 255, err = (old - nv) * es;
        buf[i] = nv;
        if (params.algorithm === "floyd-steinberg") {
          const nx = gx + xD;
          if (nx >= 0 && nx < gw) buf[gy * gw + nx] += err * 7 / 16;
          if (gy + 1 < gh) { const px2 = gx - xD; if (px2 >= 0 && px2 < gw) buf[(gy + 1) * gw + px2] += err * 3 / 16; buf[(gy + 1) * gw + gx] += err * 5 / 16; if (nx >= 0 && nx < gw) buf[(gy + 1) * gw + nx] += err / 16; }
        } else {
          for (const [dx, dy] of [[xD, 0], [xD * 2, 0], [-xD, 1], [0, 1], [xD, 1], [0, 2]]) {
            const nx = gx + dx, ny = gy + dy; if (nx >= 0 && nx < gw && ny >= 0 && ny < gh) buf[ny * gw + nx] += err / 8;
          }
        }
      }
    }
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      if (buf[gy * gw + gx] < 128) {
        const ox = gx * step, oy = gy * step;
        const v = gray[clamp(Math.floor(oy * sy), 0, ih - 1) * iw + clamp(Math.floor(ox * sx), 0, iw - 1)];
        const origV = params.invert ? 255 - v : v;
        const intensity = 1 - clamp(origV) / 255;
        const rad = params.dotMinRadius + intensity * (params.dotMaxRadius - params.dotMinRadius);
        dots.push({ x: ox, y: oy, r: rad, ...sampleColor(ox, oy) });
      }
    }
  }

  // Glyph overlay (edge-based circle layer)
  if (params.glyphOverlay) {
    const edges = sobelEdge(gray, iw, ih);
    const gs = params.glyphSpacing;
    for (let oy = 0; oy < outputHeight; oy += gs) {
      for (let ox = 0; ox < outputWidth; ox += gs) {
        const px = clamp(Math.floor(ox * sx), 0, iw - 1), py = clamp(Math.floor(oy * sy), 0, ih - 1);
        const edgeMag = edges[py * iw + px];
        if (params.glyphEdgeOnly && edgeMag < params.glyphEdgeThreshold) continue;
        const lum = gray[py * iw + px] / 255;
        const r = params.glyphRadius * (params.glyphEdgeOnly ? (edgeMag / 255) : (1 - lum));
        if (r < 0.3) continue;
        dots.push({ x: ox, y: oy, r, ...sampleColor(ox, oy) });
      }
    }
  }

  return dots;
}

// Draw dots to canvas with optional color overlay + blend mode
export function drawDots(
  ctx: CanvasRenderingContext2D,
  dots: DotCoord[],
  params: DitherParams,
  w: number,
  h: number
) {
  // ── OffscreenCanvas buffer: compose everything off-screen → single atomic flip ──
  const off = document.createElement("canvas");
  off.width = w; off.height = h;
  const offCtx = off.getContext("2d")!;

  // Background
  offCtx.fillStyle = params.bgColor;
  offCtx.fillRect(0, 0, w, h);

  // Dots
  if (params.useSourceColor) {
    for (const d of dots) {
      offCtx.fillStyle = d.cr !== undefined ? `rgb(${d.cr},${d.cg},${d.cb})` : params.dotColor;
      offCtx.beginPath(); offCtx.arc(d.x, d.y, d.r, 0, Math.PI * 2); offCtx.fill();
    }
  } else {
    offCtx.fillStyle = params.dotColor;
    for (const d of dots) { offCtx.beginPath(); offCtx.arc(d.x, d.y, d.r, 0, Math.PI * 2); offCtx.fill(); }
  }

  // Color overlay
  if (params.overlayOpacity > 0) {
    offCtx.globalCompositeOperation = params.blendMode === "normal" ? "source-over" : params.blendMode as GlobalCompositeOperation;
    offCtx.globalAlpha = params.overlayOpacity;
    offCtx.fillStyle = params.overlayColor;
    offCtx.fillRect(0, 0, w, h);
    offCtx.globalAlpha = 1;
    offCtx.globalCompositeOperation = "source-over";
  }

  // Atomic flip to visible canvas
  ctx.drawImage(off, 0, 0);
}

export function generateInteractionCode(dots: DotCoord[], repelRadius: number, repelStrength: number): string {
  return `// ditherit — Generated Interaction Code
// ${dots.length} dots · repelRadius: ${repelRadius} · repelStrength: ${repelStrength}

const DOT_DATA = ${JSON.stringify(dots.map(d => ({
    x: Math.round(d.x), y: Math.round(d.y), r: +d.r.toFixed(2),
    ...(d.cr !== undefined ? { cr: d.cr, cg: d.cg, cb: d.cb } : {})
  })))};

class DitherInteraction {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dots = DOT_DATA.map(d => ({ ...d, ox: d.x, oy: d.y, vx:0, vy:0 }));
    this.mouse = { x: -9999, y: -9999 };
    this.repelRadius  = options.repelRadius  ?? ${repelRadius};
    this.repelStrength = options.repelStrength ?? ${repelStrength};
    this.bgColor  = options.bgColor  ?? '#0a0a0a';
    this.dotColor = options.dotColor ?? '#ffffff';
    this.useSourceColor = ${dots[0]?.cr !== undefined};
    this.raf = null;
    const SPRING = 0.12, DAMPING = 0.78;
    let prev = 0;
    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
      this.mouse.y = (e.clientY - rect.top)  * (canvas.height / rect.height);
    });
    canvas.addEventListener('mouseleave', () => { this.mouse.x = -9999; this.mouse.y = -9999; });
    this._SPRING = SPRING; this._DAMPING = DAMPING; this._prev = prev;
  }
  start() { const loop = t => { this.update(t); this.draw(); this.raf = requestAnimationFrame(loop); }; this.raf = requestAnimationFrame(loop); }
  stop()  { if (this.raf) cancelAnimationFrame(this.raf); }
  update(time) {
    const dt = Math.min((time - this._prev) / 16.67, 2); this._prev = time;
    for (const d of this.dots) {
      const sx = (d.ox - d.x) * this._SPRING * dt;
      const sy = (d.oy - d.y) * this._SPRING * dt;
      const dx = d.x - this.mouse.x, dy = d.y - this.mouse.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      let fx = sx, fy = sy;
      if (dist < this.repelRadius && dist > 0.5) {
        const t = 1 - dist/this.repelRadius, force = t*t*t * this.repelStrength;
        fx += (dx/dist)*force*dt; fy += (dy/dist)*force*dt;
      }
      d.vx = (d.vx + fx) * Math.pow(this._DAMPING, dt);
      d.vy = (d.vy + fy) * Math.pow(this._DAMPING, dt);
      d.x += d.vx; d.y += d.vy;
    }
  }
  draw() {
    const { ctx, canvas } = this;
    ctx.fillStyle = this.bgColor; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const d of this.dots) {
      ctx.fillStyle = this.useSourceColor && d.cr !== undefined ? \`rgb(\${d.cr},\${d.cg},\${d.cb})\` : this.dotColor;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
    }
  }
}
// const interaction = new DitherInteraction(document.getElementById('canvas'));
// interaction.start();
`;
}

export function dotsToSVG(dots: DotCoord[], w: number, h: number, dotColor: string, bgColor: string): string {
  const circles = dots.map(d => {
    const fill = d.cr !== undefined ? `rgb(${d.cr},${d.cg},${d.cb})` : dotColor;
    return `  <circle cx="${Math.round(d.x)}" cy="${Math.round(d.y)}" r="${d.r.toFixed(2)}" fill="${fill}"/>`;
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">\n  <rect width="${w}" height="${h}" fill="${bgColor}"/>\n${circles}\n</svg>`;
}

export function generateReactCode(p: DitherParams, ap: Record<string, unknown>, mode: string, videoRender: string): string {
  const isAscii = mode === 'ascii' || (mode === 'video' && videoRender === 'ascii');
  const isVideo = mode === 'video';
  const type = isAscii ? 'ascii' : isVideo ? 'video' : 'image';

  const props: Record<string, unknown> = { type, src: '/path/to/your/asset', resolution: 600 };

  if (!isAscii) {
    props.algorithm = p.algorithm;
    props.spacing = p.scale;
    props.minRadius = +p.dotMinRadius.toFixed(1);
    props.maxRadius = +p.dotMaxRadius.toFixed(1);
    props.threshold = p.threshold;
    props.contrast = p.contrast;
    props.brightness = p.brightness;
    props.gamma = +p.gamma.toFixed(2);
    props.blur = +p.blur.toFixed(1);
    props.highlights = +p.highlightCompression.toFixed(2);
    props.errorStrength = +p.errorStrength.toFixed(2);
    props.serpentine = p.serpentine;
    props.invert = p.invert;
    props.backgroundColor = p.bgColor;
    props.dotColor = p.dotColor;
    props.sourceColors = p.useSourceColor;
    if (p.overlayOpacity > 0) {
      props.overlayColor = p.overlayColor;
      props.overlayOpacity = +p.overlayOpacity.toFixed(2);
      props.blendMode = p.blendMode;
    }
    if (p.glyphOverlay) {
      props.glyphOverlay = true;
      props.glyphRadius = +p.glyphRadius.toFixed(1);
      props.glyphSpacing = p.glyphSpacing;
      props.glyphEdgeOnly = p.glyphEdgeOnly;
      props.glyphEdgeThreshold = p.glyphEdgeThreshold;
    }
    props.interactive = true;
    props.repelRadius = p.repelRadius;
    props.repelStrength = p.repelStrength;
  } else {
    props.charset = ap.charset;
    props.fontSize = ap.fontSize;
    props.charSpacing = +(ap.charSpacing as number).toFixed(2);
    props.lineSpacing = +(ap.lineSpacing as number).toFixed(2);
    props.fontFamily = ap.fontFamily;
    props.contrast = ap.contrast;
    props.brightness = ap.brightness;
    props.gamma = +(ap.gamma as number).toFixed(2);
    props.colored = ap.colored;
    props.backgroundColor = ap.bgColor;
    props.fgColor = ap.fgColor;
    props.glow = ap.glow;
    if (ap.glow) { props.glowColor = ap.glowColor; props.glowRadius = ap.glowRadius; }
  }

  if (isVideo || isAscii) {
    props.play = true;
    props.loop = true;
    props.muted = true;
    props.fps = 24;
  }

  const propsStr = Object.entries(props)
    .map(([k, v]) => {
      if (typeof v === 'string') return `  ${k}="${v}"`;
      if (typeof v === 'boolean') return v ? `  ${k}` : `  ${k}={false}`;
      return `  ${k}={${JSON.stringify(v)}}`;
    }).join('\n');

  return `import { Dither } from 'ditherit-react';
// npm install ditherit-react

export default function MyDither() {
  return (
    <Dither
${propsStr}
    />
  );
}`;
}