"use strict";
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  ASCII_CHARSETS: () => ASCII_CHARSETS,
  Dither: () => Dither,
  ditherImageData: () => ditherImageData,
  dotsToSVG: () => dotsToSVG,
  drawAscii: () => drawAscii,
  drawDots: () => drawDots,
  imageDataToAscii: () => imageDataToAscii
});
module.exports = __toCommonJS(index_exports);

// src/Dither.tsx
var import_react = require("react");

// src/engine.ts
var BAYER = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21]
];
var clamp = (v, mn = 0, mx = 255) => Math.max(mn, Math.min(mx, v));
function buildGray(src, iw, ih, brightness, contrast, gamma, hc, blur, invert) {
  let g = new Float32Array(iw * ih);
  for (let i = 0; i < iw * ih; i++) {
    const a = src[i * 4 + 3] / 255;
    let v = (0.299 * src[i * 4] + 0.587 * src[i * 4 + 1] + 0.114 * src[i * 4 + 2]) * a + 255 * (1 - a);
    v = clamp(v + brightness);
    const cf = 259 * (contrast + 255) / (255 * (259 - contrast));
    v = clamp(cf * (v - 128) + 128);
    v = clamp(Math.pow(v / 255, 1 / gamma) * 255);
    if (hc > 0) {
      const t = v / 255;
      v = clamp((t - hc * t * t) * 255);
    }
    g[i] = v;
  }
  if (blur >= 0.5) {
    const r = Math.max(1, Math.round(blur)), sz = 2 * r + 1;
    const tmp = new Float32Array(iw * ih), out = new Float32Array(iw * ih);
    for (let y = 0; y < ih; y++) {
      let s = 0;
      for (let x = -r; x <= r; x++) s += g[y * iw + clamp(x, 0, iw - 1)];
      for (let x = 0; x < iw; x++) {
        tmp[y * iw + x] = s / sz;
        s += g[y * iw + clamp(x + r + 1, 0, iw - 1)] - g[y * iw + clamp(x - r, 0, iw - 1)];
      }
    }
    for (let x = 0; x < iw; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += tmp[clamp(y, 0, ih - 1) * iw + x];
      for (let y = 0; y < ih; y++) {
        out[y * iw + x] = s / sz;
        s += tmp[clamp(y + r + 1, 0, ih - 1) * iw + x] - tmp[clamp(y - r, 0, ih - 1) * iw + x];
      }
    }
    g = out;
  }
  if (invert) for (let i = 0; i < g.length; i++) g[i] = 255 - g[i];
  return g;
}
function sobelEdge(gray, w, h) {
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const gx = -gray[(y - 1) * w + (x - 1)] - 2 * gray[y * w + (x - 1)] - gray[(y + 1) * w + (x - 1)] + gray[(y - 1) * w + (x + 1)] + 2 * gray[y * w + (x + 1)] + gray[(y + 1) * w + (x + 1)];
    const gy = -gray[(y - 1) * w + (x - 1)] - 2 * gray[(y - 1) * w + x] - gray[(y - 1) * w + (x + 1)] + gray[(y + 1) * w + (x - 1)] + 2 * gray[(y + 1) * w + x] + gray[(y + 1) * w + (x + 1)];
    out[y * w + x] = clamp(Math.sqrt(gx * gx + gy * gy));
  }
  return out;
}
function ditherImageData(imageData, opts, outW, outH) {
  const {
    algorithm = "floyd-steinberg",
    serpentine = true,
    errorStrength = 0.85,
    invert = false,
    spacing = 6,
    minRadius = 1,
    maxRadius = 2.5,
    threshold = 128,
    contrast = 20,
    brightness = 0,
    gamma = 1.2,
    blur = 0.5,
    highlights = 0.1,
    sourceColors = false,
    glyphOverlay = false,
    glyphRadius = 1.5,
    glyphSpacing = 8,
    glyphEdgeOnly = true,
    glyphEdgeThreshold = 40
  } = opts;
  const { width: iw, height: ih, data: src } = imageData;
  const gray = buildGray(src, iw, ih, brightness, contrast, gamma, highlights, blur, invert);
  const sx = iw / outW, sy = ih / outH, step = spacing;
  const dots = [];
  const sc = (ox, oy) => sourceColors ? {
    cr: src[(clamp(Math.floor(oy * sy), 0, ih - 1) * iw + clamp(Math.floor(ox * sx), 0, iw - 1)) * 4],
    cg: src[(clamp(Math.floor(oy * sy), 0, ih - 1) * iw + clamp(Math.floor(ox * sx), 0, iw - 1)) * 4 + 1],
    cb: src[(clamp(Math.floor(oy * sy), 0, ih - 1) * iw + clamp(Math.floor(ox * sx), 0, iw - 1)) * 4 + 2]
  } : void 0;
  if (algorithm === "ordered") {
    for (let oy = 0; oy < outH; oy += step) for (let ox = 0; ox < outW; ox += step) {
      const v = gray[clamp(Math.floor(oy * sy), 0, ih - 1) * iw + clamp(Math.floor(ox * sx), 0, iw - 1)];
      if (v < BAYER[oy % 8][ox % 8] / 64 * 255) {
        const i = 1 - v / 255;
        dots.push(__spreadValues({ x: ox, y: oy, r: minRadius + i * (maxRadius - minRadius) }, sc(ox, oy)));
      }
    }
  } else if (algorithm === "threshold") {
    for (let oy = 0; oy < outH; oy += step) for (let ox = 0; ox < outW; ox += step) {
      const v = gray[clamp(Math.floor(oy * sy), 0, ih - 1) * iw + clamp(Math.floor(ox * sx), 0, iw - 1)];
      if (v < threshold) {
        const i = 1 - v / 255;
        dots.push(__spreadValues({ x: ox, y: oy, r: minRadius + i * (maxRadius - minRadius) }, sc(ox, oy)));
      }
    }
  } else {
    const gw = Math.ceil(outW / step), gh = Math.ceil(outH / step);
    const buf = new Float32Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) buf[gy * gw + gx] = gray[clamp(Math.floor(gy * step * sy), 0, ih - 1) * iw + clamp(Math.floor(gx * step * sx), 0, iw - 1)];
    const es = errorStrength;
    for (let gy = 0; gy < gh; gy++) {
      const fwd = serpentine && gy % 2 === 1, xS = fwd ? gw - 1 : 0, xE = fwd ? -1 : gw, xD = fwd ? -1 : 1;
      for (let gx = xS; gx !== xE; gx += xD) {
        const i = gy * gw + gx, old = buf[i], nv = old < threshold ? 0 : 255, err = (old - nv) * es;
        buf[i] = nv;
        if (algorithm === "floyd-steinberg") {
          const nx = gx + xD;
          if (nx >= 0 && nx < gw) buf[gy * gw + nx] += err * 7 / 16;
          if (gy + 1 < gh) {
            const px2 = gx - xD;
            if (px2 >= 0 && px2 < gw) buf[(gy + 1) * gw + px2] += err * 3 / 16;
            buf[(gy + 1) * gw + gx] += err * 5 / 16;
            if (nx >= 0 && nx < gw) buf[(gy + 1) * gw + nx] += err / 16;
          }
        } else {
          for (const [dx, dy] of [[xD, 0], [xD * 2, 0], [-xD, 1], [0, 1], [xD, 1], [0, 2]]) {
            const nx = gx + dx, ny = gy + dy;
            if (nx >= 0 && nx < gw && ny >= 0 && ny < gh) buf[ny * gw + nx] += err / 8;
          }
        }
      }
    }
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) if (buf[gy * gw + gx] < 128) {
      const ox = gx * step, oy = gy * step;
      const v = gray[clamp(Math.floor(oy * sy), 0, ih - 1) * iw + clamp(Math.floor(ox * sx), 0, iw - 1)];
      const i = 1 - clamp(invert ? 255 - v : v) / 255;
      dots.push(__spreadValues({ x: ox, y: oy, r: minRadius + i * (maxRadius - minRadius) }, sc(ox, oy)));
    }
  }
  if (glyphOverlay) {
    const edges = sobelEdge(gray, iw, ih);
    for (let oy = 0; oy < outH; oy += glyphSpacing) for (let ox = 0; ox < outW; ox += glyphSpacing) {
      const px = clamp(Math.floor(ox * sx), 0, iw - 1), py = clamp(Math.floor(oy * sy), 0, ih - 1);
      const em = edges[py * iw + px];
      if (glyphEdgeOnly && em < glyphEdgeThreshold) continue;
      const r = glyphRadius * (glyphEdgeOnly ? em / 255 : 1 - gray[py * iw + px] / 255);
      if (r < 0.3) continue;
      dots.push(__spreadValues({ x: ox, y: oy, r }, sc(ox, oy)));
    }
  }
  return dots;
}
var ASCII_CHARSETS = {
  detailed: "@#S%?*+;:,. ",
  blocks: "\u2588\u2593\u2592\u2591 ",
  pixel: "\u2588\u2580\u2584\u258C\u2590\u25AA\xB7 ",
  minimal: "@:. "
};
function imageDataToAscii(imageData, opts, outW, outH) {
  var _a;
  const {
    charset = "detailed",
    fontSize = 8,
    charSpacing = 0.6,
    lineSpacing = 1,
    colored = false,
    contrast = 10,
    brightness = 0,
    gamma = 1,
    invertBrightness = false
  } = opts;
  const { width: iw, height: ih, data: src } = imageData;
  const cs = (_a = ASCII_CHARSETS[charset]) != null ? _a : charset;
  const cellW = fontSize * charSpacing, cellH = fontSize * lineSpacing;
  const cols = Math.max(1, Math.floor(outW / cellW)), rows = Math.max(1, Math.floor(outH / cellH));
  const cells = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const x0 = Math.floor(col / cols * iw), y0 = Math.floor(row / rows * ih), x1 = Math.floor((col + 1) / cols * iw), y1 = Math.floor((row + 1) / rows * ih);
    let rS = 0, gS = 0, bS = 0, aS = 0, n = 0;
    for (let py = y0; py < y1 || py === y0; py++) for (let px = x0; px < x1 || px === x0; px++) {
      const i = (clamp(py, 0, ih - 1) * iw + clamp(px, 0, iw - 1)) * 4;
      rS += src[i];
      gS += src[i + 1];
      bS += src[i + 2];
      aS += src[i + 3];
      n++;
    }
    const r = rS / n, g = gS / n, b = bS / n, a = aS / n / 255;
    let lum = (0.299 * r + 0.587 * g + 0.114 * b) * a + 255 * (1 - a);
    lum = clamp(lum + brightness);
    const cf = 259 * (contrast + 255) / (255 * (259 - contrast));
    lum = clamp(cf * (lum - 128) + 128);
    lum = clamp(Math.pow(lum / 255, 1 / gamma) * 255);
    if (invertBrightness) lum = 255 - lum;
    const t = lum / 255, ci = Math.min(Math.floor(t * cs.length), cs.length - 1);
    cells.push({ char: cs[ci], x: col * cellW, y: row * cellH, w: cellW, h: cellH, brightness: t, r, g, b, a });
  }
  return cells;
}
function drawDots(ctx, dots, opts, w, h) {
  const { bgColor = "#0a0a0a", dotColor = "#fff", useSourceColor = false, overlayColor = "#000", overlayOpacity = 0, blendMode = "normal" } = opts;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, w, h);
  if (useSourceColor) {
    for (const d of dots) {
      ctx.fillStyle = d.cr !== void 0 ? `rgb(${d.cr},${d.cg},${d.cb})` : dotColor;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = dotColor;
    for (const d of dots) {
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (overlayOpacity > 0) {
    ctx.globalCompositeOperation = blendMode === "normal" ? "source-over" : blendMode;
    ctx.globalAlpha = overlayOpacity;
    ctx.fillStyle = overlayColor;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}
function drawAscii(ctx, cells, opts, w, h) {
  const {
    bgColor = "#0a0a0a",
    fgColor = "#fff",
    colored = false,
    fontSize = 8,
    fontFamily = "monospace",
    glow = false,
    glowColor = "#7c5af0",
    glowRadius = 6
  } = opts;
  if (ctx.canvas.width !== w || ctx.canvas.height !== h) {
    ctx.canvas.width = w;
    ctx.canvas.height = h;
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, w, h);
  if (glow) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = glowRadius;
  }
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textBaseline = "top";
  for (const c of cells) {
    if (c.char === " " || c.a < 0.05) continue;
    ctx.fillStyle = colored ? `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${c.a.toFixed(2)})` : fgColor;
    ctx.fillText(c.char, c.x, c.y);
  }
  ctx.shadowBlur = 0;
}
function dotsToSVG(dots, w, h, dotColor, bgColor) {
  const circles = dots.map((d) => {
    const fill = d.cr !== void 0 ? `rgb(${d.cr},${d.cg},${d.cb})` : dotColor;
    return `  <circle cx="${Math.round(d.x)}" cy="${Math.round(d.y)}" r="${d.r.toFixed(2)}" fill="${fill}"/>`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="${bgColor}"/>
${circles}
</svg>`;
}

// src/Dither.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var MAX_FRAMES = 120;
var Dither = ({
  type = "image",
  src,
  resolution = 600,
  width,
  height,
  algorithm = "floyd-steinberg",
  spacing = 6,
  minRadius = 1,
  maxRadius = 2.5,
  charset = "detailed",
  fontSize = 8,
  charSpacing = 0.6,
  lineSpacing = 1,
  fontFamily = "monospace",
  threshold = 128,
  contrast = 20,
  brightness = 0,
  gamma = 1.2,
  blur = 0.5,
  highlights = 0.1,
  errorStrength = 0.85,
  serpentine = true,
  invert = false,
  backgroundColor = "#0a0a0a",
  dotColor = "#ffffff",
  sourceColors = false,
  fgColor = "#ffffff",
  colored = false,
  glow = false,
  glowColor = "#7c5af0",
  glowRadius = 6,
  overlayColor = "#000",
  overlayOpacity = 0,
  blendMode = "normal",
  glyphOverlay = false,
  glyphRadius = 1.5,
  glyphSpacing = 8,
  glyphEdgeOnly = true,
  glyphEdgeThreshold = 40,
  play = true,
  loop = true,
  muted = true,
  fps = 24,
  interactive = false,
  repelRadius = 80,
  repelStrength = 60,
  className,
  style
}) => {
  const canvasRef = (0, import_react.useRef)(null);
  const mouseRef = (0, import_react.useRef)({ x: -9999, y: -9999 });
  const dotsRef = (0, import_react.useRef)([]);
  const rafRef = (0, import_react.useRef)(0);
  const dFramesRef = (0, import_react.useRef)([]);
  const ascFramesRef = (0, import_react.useRef)([]);
  const frameIdxRef = (0, import_react.useRef)(0);
  const playingRef = (0, import_react.useRef)(play);
  const [ready, setReady] = (0, import_react.useState)(false);
  const cw = width != null ? width : resolution;
  const ch = height != null ? height : resolution;
  const ditherOpts = {
    algorithm,
    serpentine,
    errorStrength,
    invert,
    spacing,
    minRadius,
    maxRadius,
    threshold,
    contrast,
    brightness,
    gamma,
    blur,
    highlights,
    sourceColors,
    glyphOverlay,
    glyphRadius,
    glyphSpacing,
    glyphEdgeOnly,
    glyphEdgeThreshold
  };
  const drawOpts = { bgColor: backgroundColor, dotColor, useSourceColor: sourceColors, overlayColor, overlayOpacity, blendMode };
  const asciiOpts = { bgColor: backgroundColor, fgColor, colored, fontSize, fontFamily, glow, glowColor, glowRadius };
  const getImageData = (0, import_react.useCallback)((src2) => {
    const off = document.createElement("canvas");
    off.width = cw;
    off.height = ch;
    const ctx = off.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(src2, 0, 0, cw, ch);
    return ctx.getImageData(0, 0, cw, ch);
  }, [cw, ch]);
  (0, import_react.useEffect)(() => {
    if (type !== "image") return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = cw;
      canvas.height = ch;
      const imageData = getImageData(img);
      if (!imageData) return;
      const dots = ditherImageData(imageData, ditherOpts, cw, ch);
      dotsRef.current = dots.map((d) => __spreadProps(__spreadValues({}, d), { ox: d.x, oy: d.y, vx: 0, vy: 0 }));
      const ctx = canvas.getContext("2d");
      drawDots(ctx, dots, drawOpts, cw, ch);
      setReady(true);
    };
    img.src = src;
  }, [src, type, cw, ch]);
  (0, import_react.useEffect)(() => {
    if (type !== "video" && type !== "ascii") return;
    const video = document.createElement("video");
    video.muted = muted;
    video.loop = loop;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      const duration = video.duration;
      const totalFrames = Math.min(Math.floor(duration * fps), MAX_FRAMES);
      const interval = duration / totalFrames;
      const rawFrames = [];
      let idx = 0;
      const capture = () => {
        const fd = getImageData(video);
        if (fd) rawFrames.push(fd);
        idx++;
        if (idx >= totalFrames) {
          if (type === "video") {
            dFramesRef.current = rawFrames.map((f) => ditherImageData(f, ditherOpts, cw, ch));
          } else {
            ascFramesRef.current = rawFrames.map(
              (f) => imageDataToAscii(f, { charset, fontSize, charSpacing, lineSpacing, colored, contrast, brightness, gamma, invertBrightness: invert }, cw, ch)
            );
          }
          setReady(true);
          return;
        }
        video.currentTime = idx * interval;
      };
      video.onseeked = capture;
      video.currentTime = 0;
    };
    video.src = src;
  }, [src, type, cw, ch]);
  (0, import_react.useEffect)(() => {
    if (!ready || type === "image") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    const ms = 1e3 / fps;
    let last = 0;
    cancelAnimationFrame(rafRef.current);
    const loop2 = (time) => {
      if (playingRef.current && time - last >= ms) {
        last = time;
        if (type === "video") {
          if (!dFramesRef.current.length) {
            rafRef.current = requestAnimationFrame(loop2);
            return;
          }
          frameIdxRef.current = (frameIdxRef.current + 1) % dFramesRef.current.length;
          drawDots(ctx, dFramesRef.current[frameIdxRef.current], drawOpts, cw, ch);
        } else {
          if (!ascFramesRef.current.length) {
            rafRef.current = requestAnimationFrame(loop2);
            return;
          }
          frameIdxRef.current = (frameIdxRef.current + 1) % ascFramesRef.current.length;
          drawAscii(ctx, ascFramesRef.current[frameIdxRef.current], asciiOpts, cw, ch);
        }
      }
      rafRef.current = requestAnimationFrame(loop2);
    };
    rafRef.current = requestAnimationFrame(loop2);
    return () => cancelAnimationFrame(rafRef.current);
  }, [ready, type, cw, ch, fps]);
  (0, import_react.useEffect)(() => {
    if (!interactive || !ready || type !== "image") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const SPRING = 0.12, DAMPING = 0.78;
    let prev = 0;
    cancelAnimationFrame(rafRef.current);
    const loop2 = (time) => {
      const dt = Math.min((time - prev) / 16.67, 2);
      prev = time;
      const m = mouseRef.current;
      for (const d of dotsRef.current) {
        const sx = (d.ox - d.x) * SPRING * dt;
        const sy = (d.oy - d.y) * SPRING * dt;
        const dx = d.x - m.x, dy = d.y - m.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        let fx = sx, fy = sy;
        if (dist < repelRadius && dist > 0.5) {
          const t = 1 - dist / repelRadius, force = t * t * t * repelStrength;
          fx += dx / dist * force * dt;
          fy += dy / dist * force * dt;
        }
        d.vx = (d.vx + fx) * Math.pow(DAMPING, dt);
        d.vy = (d.vy + fy) * Math.pow(DAMPING, dt);
        d.x += d.vx;
        d.y += d.vy;
      }
      drawDots(ctx, dotsRef.current, drawOpts, cw, ch);
      rafRef.current = requestAnimationFrame(loop2);
    };
    rafRef.current = requestAnimationFrame(loop2);
    return () => cancelAnimationFrame(rafRef.current);
  }, [interactive, ready, repelRadius, repelStrength, cw, ch]);
  (0, import_react.useEffect)(() => {
    playingRef.current = play;
  }, [play]);
  const handleMouseMove = (0, import_react.useCallback)((e) => {
    var _a, _b, _c, _d;
    if (!interactive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    mouseRef.current = {
      x: (e.clientX - rect.left) * (((_b = (_a = canvasRef.current) == null ? void 0 : _a.width) != null ? _b : 1) / rect.width),
      y: (e.clientY - rect.top) * (((_d = (_c = canvasRef.current) == null ? void 0 : _c.height) != null ? _d : 1) / rect.height)
    };
  }, [interactive]);
  const handleMouseLeave = (0, import_react.useCallback)(() => {
    mouseRef.current = { x: -9999, y: -9999 };
  }, []);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "canvas",
    {
      ref: canvasRef,
      className,
      style: __spreadValues({ display: "block" }, style),
      onMouseMove: handleMouseMove,
      onMouseLeave: handleMouseLeave
    }
  );
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ASCII_CHARSETS,
  Dither,
  ditherImageData,
  dotsToSVG,
  drawAscii,
  drawDots,
  imageDataToAscii
});
