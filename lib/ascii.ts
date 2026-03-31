export interface AsciiCell {
    char: string;
    x: number;
    y: number;
    w: number;
    h: number;
    brightness: number;
    r: number; g: number; b: number; a: number;
}

export interface AsciiParams {
    charset: "detailed" | "blocks" | "pixel" | "minimal" | "custom";
    customCharset: string;
    fontSize: number;
    fontFamily: "monospace" | "courier" | "consolas";
    charSpacing: number;   // 0.4–2.0
    lineSpacing: number;   // 0.8–2.5
    colored: boolean;
    bgColor: string;
    fgColor: string;
    invertBrightness: boolean;
    contrast: number;
    brightness: number;
    gamma: number;
    glow: boolean;         // neon glow effect
    glowColor: string;
    glowRadius: number;    // 0–20
    transparentBg?: boolean; // skip bg fill (used when bg-erase is enabled)
}

export const ASCII_CHARSETS: Record<string, string> = {
    detailed: "@#S%?*+;:,. ",
    blocks: "█▓▒░ ",
    pixel: "█▀▄▌▐▪· ",   // pixel-block style
    minimal: "@:. ",
};

export const DEFAULT_ASCII_PARAMS: AsciiParams = {
    charset: "detailed",
    customCharset: "@#%+:. ",
    fontSize: 8,
    fontFamily: "monospace",
    charSpacing: 0.6,
    lineSpacing: 1.0,
    colored: true,
    bgColor: "#0a0a0a",
    fgColor: "#ffffff",
    invertBrightness: true,
    contrast: 10,
    brightness: 0,
    gamma: 1.0,
    glow: false,
    glowColor: "#7c5af0",
    glowRadius: 6,
};

function clamp(v: number, min = 0, max = 255) { return Math.max(min, Math.min(max, v)); }

function applyContrast(v: number, c: number) {
    const f = (259 * (c + 255)) / (255 * (259 - c));
    return clamp(f * (v - 128) + 128);
}

function applyGamma(v: number, g: number) {
    return clamp(Math.pow(v / 255, 1 / g) * 255);
}

export function imageDataToAscii(
    imageData: ImageData,
    params: AsciiParams,
    outputWidth: number,
    outputHeight: number
): AsciiCell[] {
    const { width: iw, height: ih } = imageData;
    const src = imageData.data;

    const charset = params.charset === "custom"
        ? (params.customCharset || ASCII_CHARSETS.detailed)
        : ASCII_CHARSETS[params.charset];

    const cellW = params.fontSize * params.charSpacing;
    const cellH = params.fontSize * params.lineSpacing;
    const cols = Math.max(1, Math.floor(outputWidth / cellW));
    const rows = Math.max(1, Math.floor(outputHeight / cellH));

    const cells: AsciiCell[] = [];

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            // Sample average color over the cell area in source image
            const x0 = Math.floor((col / cols) * iw);
            const y0 = Math.floor((row / rows) * ih);
            const x1 = Math.floor(((col + 1) / cols) * iw);
            const y1 = Math.floor(((row + 1) / rows) * ih);

            let rSum = 0, gSum = 0, bSum = 0, aSum = 0, count = 0;
            for (let py = y0; py < y1 || py === y0; py++) {
                for (let px = x0; px < x1 || px === x0; px++) {
                    const i = (clamp(py, 0, ih - 1) * iw + clamp(px, 0, iw - 1)) * 4;
                    rSum += src[i]; gSum += src[i + 1]; bSum += src[i + 2]; aSum += src[i + 3];
                    count++;
                }
            }
            const r = rSum / count, g = gSum / count, b = bSum / count, a = (aSum / count) / 255;

            let lum = (0.299 * r + 0.587 * g + 0.114 * b) * a + 255 * (1 - a);
            lum = clamp(lum + params.brightness);
            lum = applyContrast(lum, params.contrast);
            lum = applyGamma(lum, params.gamma);
            if (params.invertBrightness) lum = 255 - lum;

            const t = lum / 255;
            const charIdx = Math.min(Math.floor(t * charset.length), charset.length - 1);
            const char = charset[charIdx];

            cells.push({
                char,
                x: col * cellW,
                y: row * cellH,
                w: cellW,
                h: cellH,
                brightness: t,
                r, g, b, a,
            });
        }
    }

    return cells;
}

export function renderAsciiToCanvas(
    canvas: HTMLCanvasElement,
    cells: AsciiCell[],
    params: AsciiParams,
    width: number,
    height: number
) {
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
    const ctx = canvas.getContext("2d")!;

    // ── OffscreenCanvas buffer: compose everything atomically → no blink ──
    const off = document.createElement("canvas");
    off.width = width; off.height = height;
    const offCtx = off.getContext("2d")!;

    offCtx.shadowBlur = 0;
    offCtx.globalAlpha = 1;

    if (params.transparentBg) {
        offCtx.clearRect(0, 0, width, height);
    } else {
        offCtx.fillStyle = params.bgColor;
        offCtx.fillRect(0, 0, width, height);
    }

    if (params.glow) {
        offCtx.shadowColor = params.glowColor;
        offCtx.shadowBlur = params.glowRadius;
    }

    const isPixelMode = params.charset === "pixel";

    if (isPixelMode) {
        for (const cell of cells) {
            if (cell.char === " " || cell.a < 0.05) continue;
            const t = 1 - cell.brightness;
            if (params.colored) {
                offCtx.fillStyle = `rgba(${Math.round(cell.r)},${Math.round(cell.g)},${Math.round(cell.b)},${(cell.a * t).toFixed(2)})`;
                offCtx.globalAlpha = 1;
            } else {
                offCtx.fillStyle = params.fgColor;
                offCtx.globalAlpha = Math.max(0.05, t);
            }
            offCtx.fillRect(cell.x, cell.y, cell.w - 0.5, cell.h - 0.5);
        }
        offCtx.globalAlpha = 1;
    } else {
        offCtx.font = `${params.fontSize}px ${params.fontFamily}`;
        offCtx.textBaseline = "top";
        for (const cell of cells) {
            if (cell.char === " " || cell.a < 0.05) continue;
            if (params.colored) {
                offCtx.fillStyle = `rgba(${Math.round(cell.r)},${Math.round(cell.g)},${Math.round(cell.b)},${cell.a.toFixed(2)})`;
            } else {
                offCtx.fillStyle = params.fgColor;
            }
            offCtx.fillText(cell.char, cell.x, cell.y);
        }
    }

    offCtx.shadowBlur = 0;
    offCtx.globalAlpha = 1;

    // Atomic flip — clear first so transparent bg is honoured on export
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(off, 0, 0);
}


// ── ASCII Video Code Export ─────────────────────────────────────────────────
export function generateAsciiVideoCode(
    frames: AsciiCell[][],
    fps: number,
    width: number,
    height: number,
    params: AsciiParams
): string {
    // Compact frame data: each frame = array of [charIdx, r, g, b] or [charIdx]
    const charset = params.charset === "custom"
        ? params.customCharset
        : ASCII_CHARSETS[params.charset];

    const compact = frames.map(cells =>
        cells.map(c => params.colored
            ? [charset.indexOf(c.char), Math.round(c.r), Math.round(c.g), Math.round(c.b)]
            : [charset.indexOf(c.char)]
        )
    );

    return `// ditherit — ASCII Video Player
// ${frames.length} frames · ${fps}fps · ${width}×${height}px canvas
// charset: "${charset}"

const ASCII_FRAMES = ${JSON.stringify(compact)};
const ASCII_CHARSET = ${JSON.stringify(charset)};
const ASCII_FPS = ${fps};
const ASCII_COLS = ${frames[0] ? Math.round(Math.sqrt(frames[0].length * width / height)) : 0};
const ASCII_ROWS = ${frames[0] ? Math.round(frames[0].length / Math.round(Math.sqrt(frames[0].length * width / height))) : 0};
const ASCII_FONT_SIZE = ${params.fontSize};
const ASCII_COLORED = ${params.colored};
const ASCII_FG = "${params.fgColor}";
const ASCII_BG = "${params.bgColor}";
const ASCII_GLOW = ${params.glow};
const ASCII_GLOW_COLOR = "${params.glowColor}";
const ASCII_CELL_W = ${+(params.fontSize * params.charSpacing).toFixed(2)};
const ASCII_CELL_H = ${+(params.fontSize * params.lineSpacing).toFixed(2)};

class AsciiVideoPlayer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.fps = options.fps ?? ASCII_FPS;
    this.loop = options.loop ?? true;
    this.frameIdx = 0;
    this.playing = false;
    this.raf = null;
    this.lastTime = 0;
    canvas.width = ${width};
    canvas.height = ${height};
  }

  play() {
    this.playing = true;
    const interval = 1000 / this.fps;
    const tick = (time) => {
      if (!this.playing) return;
      if (time - this.lastTime >= interval) {
        this.lastTime = time;
        this.drawFrame(this.frameIdx);
        this.frameIdx++;
        if (this.frameIdx >= ASCII_FRAMES.length) {
          if (this.loop) this.frameIdx = 0;
          else { this.playing = false; return; }
        }
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  pause() { this.playing = false; if (this.raf) cancelAnimationFrame(this.raf); }
  seek(idx) { this.frameIdx = idx % ASCII_FRAMES.length; this.drawFrame(this.frameIdx); }

  drawFrame(idx) {
    const ctx = this.ctx;
    const cells = ASCII_FRAMES[idx];
    if (!cells) return;
    ctx.fillStyle = ASCII_BG;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.font = ASCII_FONT_SIZE + 'px monospace';
    ctx.textBaseline = 'top';
    if (ASCII_GLOW) { ctx.shadowColor = ASCII_GLOW_COLOR; ctx.shadowBlur = 8; }
    let col = 0, row = 0;
    const totalCols = ASCII_COLS;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const char = ASCII_CHARSET[cell[0]];
      if (char && char !== ' ') {
        const x = col * ASCII_CELL_W, y = row * ASCII_CELL_H;
        if (ASCII_COLORED && cell.length >= 4) {
          ctx.fillStyle = \`rgb(\${cell[1]},\${cell[2]},\${cell[3]})\`;
        } else {
          ctx.fillStyle = ASCII_FG;
        }
        ctx.fillText(char, x, y);
      }
      col++;
      if (col >= totalCols) { col = 0; row++; }
    }
    ctx.shadowBlur = 0;
  }
}

// Usage:
// const player = new AsciiVideoPlayer(document.getElementById('canvas'));
// player.play();
// player.pause();
// player.seek(42); // jump to frame 42
`;
}