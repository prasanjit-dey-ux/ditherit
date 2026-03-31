// ─── Core dither engine (shared with ditherit studio) ────────────────────────

export type DitherAlgorithm = "floyd-steinberg" | "atkinson" | "ordered" | "threshold";
export type BlendMode = "normal" | "multiply" | "screen" | "overlay" | "soft-light" | "hard-light" | "color-dodge" | "color-burn" | "hue" | "saturation" | "luminosity" | "difference";

export interface DotCoord {
    x: number; y: number; r: number;
    cr?: number; cg?: number; cb?: number;
}

export interface AsciiCell {
    char: string; x: number; y: number; w: number; h: number;
    brightness: number; r: number; g: number; b: number; a: number;
}

const BAYER = [
    [0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21],
];

const clamp = (v: number, mn = 0, mx = 255) => Math.max(mn, Math.min(mx, v));

function buildGray(src: Uint8ClampedArray, iw: number, ih: number, brightness: number, contrast: number, gamma: number, hc: number, blur: number, invert: boolean) {
    let g: Float32Array = new Float32Array(iw * ih);
    for (let i = 0; i < iw * ih; i++) {
        const a = src[i * 4 + 3] / 255;
        let v = (0.299 * src[i * 4] + 0.587 * src[i * 4 + 1] + 0.114 * src[i * 4 + 2]) * a + 255 * (1 - a);
        v = clamp(v + brightness);
        const cf = (259 * (contrast + 255)) / (255 * (259 - contrast));
        v = clamp(cf * (v - 128) + 128);
        v = clamp(Math.pow(v / 255, 1 / gamma) * 255);
        if (hc > 0) { const t = v / 255; v = clamp((t - hc * t * t) * 255); }
        g[i] = v;
    }
    if (blur >= 0.5) {
        const r = Math.max(1, Math.round(blur)), sz = 2 * r + 1;
        const tmp = new Float32Array(iw * ih), out = new Float32Array(iw * ih);
        for (let y = 0; y < ih; y++) { let s = 0; for (let x = -r; x <= r; x++) s += g[y * iw + clamp(x, 0, iw - 1)]; for (let x = 0; x < iw; x++) { tmp[y * iw + x] = s / sz; s += g[y * iw + clamp(x + r + 1, 0, iw - 1)] - g[y * iw + clamp(x - r, 0, iw - 1)]; } }
        for (let x = 0; x < iw; x++) { let s = 0; for (let y = -r; y <= r; y++) s += tmp[clamp(y, 0, ih - 1) * iw + x]; for (let y = 0; y < ih; y++) { out[y * iw + x] = s / sz; s += tmp[clamp(y + r + 1, 0, ih - 1) * iw + x] - tmp[clamp(y - r, 0, ih - 1) * iw + x]; } }
        g = out;
    }
    if (invert) for (let i = 0; i < g.length; i++) g[i] = 255 - g[i];
    return g;
}

function sobelEdge(gray: Float32Array, w: number, h: number) {
    const out = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const gx = -gray[(y - 1) * w + (x - 1)] - 2 * gray[y * w + (x - 1)] - gray[(y + 1) * w + (x - 1)] + gray[(y - 1) * w + (x + 1)] + 2 * gray[y * w + (x + 1)] + gray[(y + 1) * w + (x + 1)];
        const gy = -gray[(y - 1) * w + (x - 1)] - 2 * gray[(y - 1) * w + x] - gray[(y - 1) * w + (x + 1)] + gray[(y + 1) * w + (x - 1)] + 2 * gray[(y + 1) * w + x] + gray[(y + 1) * w + (x + 1)];
        out[y * w + x] = clamp(Math.sqrt(gx * gx + gy * gy));
    }
    return out;
}

export function ditherImageData(
    imageData: ImageData,
    opts: {
        algorithm?: DitherAlgorithm; serpentine?: boolean; errorStrength?: number; invert?: boolean;
        spacing?: number; minRadius?: number; maxRadius?: number;
        threshold?: number; contrast?: number; brightness?: number; gamma?: number; blur?: number; highlights?: number;
        sourceColors?: boolean;
        glyphOverlay?: boolean; glyphRadius?: number; glyphSpacing?: number; glyphEdgeOnly?: boolean; glyphEdgeThreshold?: number;
    },
    outW: number, outH: number
): DotCoord[] {
    const {
        algorithm = 'floyd-steinberg', serpentine = true, errorStrength = 0.85, invert = false,
        spacing = 6, minRadius = 1, maxRadius = 2.5,
        threshold = 128, contrast = 20, brightness = 0, gamma = 1.2, blur = 0.5, highlights = 0.1,
        sourceColors = false,
        glyphOverlay = false, glyphRadius = 1.5, glyphSpacing = 8, glyphEdgeOnly = true, glyphEdgeThreshold = 40,
    } = opts;

    const { width: iw, height: ih, data: src } = imageData;
    const gray = buildGray(src, iw, ih, brightness, contrast, gamma, highlights, blur, invert);
    const sx = iw / outW, sy = ih / outH, step = spacing;
    const dots: DotCoord[] = [];

    const sc = (ox: number, oy: number) => sourceColors ? {
        cr: src[(clamp(Math.floor(oy * sy), 0, ih - 1) * iw + clamp(Math.floor(ox * sx), 0, iw - 1)) * 4],
        cg: src[(clamp(Math.floor(oy * sy), 0, ih - 1) * iw + clamp(Math.floor(ox * sx), 0, iw - 1)) * 4 + 1],
        cb: src[(clamp(Math.floor(oy * sy), 0, ih - 1) * iw + clamp(Math.floor(ox * sx), 0, iw - 1)) * 4 + 2],
    } : undefined;

    if (algorithm === 'ordered') {
        for (let oy = 0; oy < outH; oy += step) for (let ox = 0; ox < outW; ox += step) {
            const v = gray[clamp(Math.floor(oy * sy), 0, ih - 1) * iw + clamp(Math.floor(ox * sx), 0, iw - 1)];
            if (v < (BAYER[oy % 8][ox % 8] / 64) * 255) { const i = 1 - v / 255; dots.push({ x: ox, y: oy, r: minRadius + i * (maxRadius - minRadius), ...sc(ox, oy) }); }
        }
    } else if (algorithm === 'threshold') {
        for (let oy = 0; oy < outH; oy += step) for (let ox = 0; ox < outW; ox += step) {
            const v = gray[clamp(Math.floor(oy * sy), 0, ih - 1) * iw + clamp(Math.floor(ox * sx), 0, iw - 1)];
            if (v < threshold) { const i = 1 - v / 255; dots.push({ x: ox, y: oy, r: minRadius + i * (maxRadius - minRadius), ...sc(ox, oy) }); }
        }
    } else {
        const gw = Math.ceil(outW / step), gh = Math.ceil(outH / step);
        const buf = new Float32Array(gw * gh);
        for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) buf[gy * gw + gx] = gray[clamp(Math.floor(gy * step * sy), 0, ih - 1) * iw + clamp(Math.floor(gx * step * sx), 0, iw - 1)];
        const es = errorStrength;
        for (let gy = 0; gy < gh; gy++) {
            const fwd = serpentine && gy % 2 === 1, xS = fwd ? gw - 1 : 0, xE = fwd ? -1 : gw, xD = fwd ? -1 : 1;
            for (let gx = xS; gx !== xE; gx += xD) {
                const i = gy * gw + gx, old = buf[i], nv = old < threshold ? 0 : 255, err = (old - nv) * es; buf[i] = nv;
                if (algorithm === 'floyd-steinberg') {
                    const nx = gx + xD; if (nx >= 0 && nx < gw) buf[gy * gw + nx] += err * 7 / 16;
                    if (gy + 1 < gh) { const px2 = gx - xD; if (px2 >= 0 && px2 < gw) buf[(gy + 1) * gw + px2] += err * 3 / 16; buf[(gy + 1) * gw + gx] += err * 5 / 16; if (nx >= 0 && nx < gw) buf[(gy + 1) * gw + nx] += err / 16; }
                } else {
                    for (const [dx, dy] of [[xD, 0], [xD * 2, 0], [-xD, 1], [0, 1], [xD, 1], [0, 2]]) { const nx = gx + dx, ny = gy + dy; if (nx >= 0 && nx < gw && ny >= 0 && ny < gh) buf[ny * gw + nx] += err / 8; }
                }
            }
        }
        for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) if (buf[gy * gw + gx] < 128) {
            const ox = gx * step, oy = gy * step;
            const v = gray[clamp(Math.floor(oy * sy), 0, ih - 1) * iw + clamp(Math.floor(ox * sx), 0, iw - 1)];
            const i = 1 - clamp(invert ? 255 - v : v) / 255;
            dots.push({ x: ox, y: oy, r: minRadius + i * (maxRadius - minRadius), ...sc(ox, oy) });
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
            dots.push({ x: ox, y: oy, r, ...sc(ox, oy) });
        }
    }
    return dots;
}

export const ASCII_CHARSETS: Record<string, string> = {
    detailed: "@#S%?*+;:,. ", blocks: "█▓▒░ ", pixel: "█▀▄▌▐▪· ", minimal: "@:. ",
};

export function imageDataToAscii(imageData: ImageData, opts: {
    charset?: string; fontSize?: number; charSpacing?: number; lineSpacing?: number;
    colored?: boolean; contrast?: number; brightness?: number; gamma?: number; invertBrightness?: boolean;
}, outW: number, outH: number): AsciiCell[] {
    const { charset = 'detailed', fontSize = 8, charSpacing = 0.6, lineSpacing = 1.0, colored = false,
        contrast = 10, brightness = 0, gamma = 1.0, invertBrightness = false } = opts;
    const { width: iw, height: ih, data: src } = imageData;
    const cs = ASCII_CHARSETS[charset] ?? charset;
    const cellW = fontSize * charSpacing, cellH = fontSize * lineSpacing;
    const cols = Math.max(1, Math.floor(outW / cellW)), rows = Math.max(1, Math.floor(outH / cellH));
    const cells: AsciiCell[] = [];
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
        const x0 = Math.floor(col / cols * iw), y0 = Math.floor(row / rows * ih), x1 = Math.floor((col + 1) / cols * iw), y1 = Math.floor((row + 1) / rows * ih);
        let rS = 0, gS = 0, bS = 0, aS = 0, n = 0;
        for (let py = y0; py < y1 || py === y0; py++) for (let px = x0; px < x1 || px === x0; px++) {
            const i = (clamp(py, 0, ih - 1) * iw + clamp(px, 0, iw - 1)) * 4;
            rS += src[i]; gS += src[i + 1]; bS += src[i + 2]; aS += src[i + 3]; n++;
        }
        const r = rS / n, g = gS / n, b = bS / n, a = (aS / n) / 255;
        let lum = (0.299 * r + 0.587 * g + 0.114 * b) * a + 255 * (1 - a);
        lum = clamp(lum + brightness);
        const cf = (259 * (contrast + 255)) / (255 * (259 - contrast)); lum = clamp(cf * (lum - 128) + 128);
        lum = clamp(Math.pow(lum / 255, 1 / gamma) * 255);
        if (invertBrightness) lum = 255 - lum;
        const t = lum / 255, ci = Math.min(Math.floor(t * cs.length), cs.length - 1);
        cells.push({ char: cs[ci], x: col * cellW, y: row * cellH, w: cellW, h: cellH, brightness: t, r, g, b, a });
    }
    return cells;
}

export function drawDots(ctx: CanvasRenderingContext2D, dots: DotCoord[], opts: {
    bgColor?: string; dotColor?: string; useSourceColor?: boolean;
    overlayColor?: string; overlayOpacity?: number; blendMode?: BlendMode;
    transparentBg?: boolean;
}, w: number, h: number) {
    const { bgColor = '#0a0a0a', dotColor = '#fff', useSourceColor = false, overlayColor = '#000', overlayOpacity = 0, blendMode = 'normal', transparentBg = false } = opts;
    if (transparentBg) {
        ctx.clearRect(0, 0, w, h);
    } else {
        ctx.fillStyle = bgColor; ctx.fillRect(0, 0, w, h);
    }
    if (useSourceColor) {
        for (const d of dots) { ctx.fillStyle = d.cr !== undefined ? `rgb(${d.cr},${d.cg},${d.cb})` : dotColor; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill(); }
    } else {
        ctx.fillStyle = dotColor; for (const d of dots) { ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill(); }
    }
    if (overlayOpacity > 0) {
        ctx.globalCompositeOperation = (blendMode === 'normal' ? 'source-over' : blendMode) as GlobalCompositeOperation;
        ctx.globalAlpha = overlayOpacity; ctx.fillStyle = overlayColor; ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
}

export function drawAscii(ctx: CanvasRenderingContext2D, cells: AsciiCell[], opts: {
    bgColor?: string; fgColor?: string; colored?: boolean; fontSize?: number; fontFamily?: string;
    glow?: boolean; glowColor?: string; glowRadius?: number; transparentBg?: boolean;
}, w: number, h: number) {
    const { bgColor = '#0a0a0a', fgColor = '#fff', colored = false, fontSize = 8, fontFamily = 'monospace',
        glow = false, glowColor = '#7c5af0', glowRadius = 6, transparentBg = false } = opts;
    if (ctx.canvas.width !== w || ctx.canvas.height !== h) { ctx.canvas.width = w; ctx.canvas.height = h; }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    if (transparentBg) {
        ctx.clearRect(0, 0, w, h);
    } else {
        ctx.fillStyle = bgColor; ctx.fillRect(0, 0, w, h);
    }
    if (glow) { ctx.shadowColor = glowColor; ctx.shadowBlur = glowRadius; }
    ctx.font = `${fontSize}px ${fontFamily}`; ctx.textBaseline = 'top';
    for (const c of cells) {
        if (c.char === ' ' || c.a < 0.05) continue;
        ctx.fillStyle = colored ? `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${c.a.toFixed(2)})` : fgColor;
        ctx.fillText(c.char, c.x, c.y);
    }
    ctx.shadowBlur = 0;
}

export function dotsToSVG(dots: DotCoord[], w: number, h: number, dotColor: string, bgColor: string): string {
    const circles = dots.map(d => {
        const fill = d.cr !== undefined ? `rgb(${d.cr},${d.cg},${d.cb})` : dotColor;
        return `  <circle cx="${Math.round(d.x)}" cy="${Math.round(d.y)}" r="${d.r.toFixed(2)}" fill="${fill}"/>`;
    }).join('\n');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">\n  <rect width="${w}" height="${h}" fill="${bgColor}"/>\n${circles}\n</svg>`;
}
