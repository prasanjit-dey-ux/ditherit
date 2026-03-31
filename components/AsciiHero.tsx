"use client";

import { useRef, useEffect } from "react";

const CHARSET = " .·:+xX#@";

export default function AsciiHero({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const W = canvas.width;
    const H = canvas.height;
    const FONT_SIZE = 7;
    const COLS = Math.floor(W / (FONT_SIZE * 0.6));
    const ROWS = Math.floor(H / FONT_SIZE);

    // Build the logo pattern in an offscreen canvas
    const off = document.createElement("canvas");
    off.width = COLS;
    off.height = ROWS;
    const offCtx = off.getContext("2d")!;

    // Draw the logo as dots pattern in offscreen
    const drawLogo = (scale: number, offsetX: number, offsetY: number) => {
      offCtx.clearRect(0, 0, COLS, ROWS);
      offCtx.fillStyle = "#000";
      offCtx.fillRect(0, 0, COLS, ROWS);

      const cx = COLS / 2 + offsetX;
      const cy = ROWS / 2 + offsetY;

      // Draw "d" shape using dots
      const drawDot = (x: number, y: number, bright: number) => {
        const px = Math.round(cx + (x - COLS / 2) * scale);
        const py = Math.round(cy + (y - ROWS / 2) * scale);
        if (px < 0 || px >= COLS || py < 0 || py >= ROWS) return;
        offCtx.fillStyle = `rgba(124,90,240,${bright})`;
        offCtx.fillRect(px, py, 1, 1);
      };

      // Simple "ditherit" logo approximation — a 5x7 dot pattern for each letter
      // We'll draw concentric circles of dots to make a radial dither pattern
      const numDots = 800;
      for (let i = 0; i < numDots; i++) {
        const t = i / numDots;
        const angle = t * Math.PI * 20;
        const r = t * (ROWS * 0.4);
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r * 0.6;
        const bright = Math.sin(t * Math.PI * 4 + Date.now() / 1000) * 0.5 + 0.5;
        const px = Math.round(x);
        const py = Math.round(y);
        if (px >= 0 && px < COLS && py >= 0 && py < ROWS) {
          const val = Math.round(bright * 255);
          offCtx.fillStyle = `rgb(${val},${Math.round(val * 0.6)},${Math.round(255 * t)})`;
          offCtx.fillRect(px, py, 1, 1);
        }
      }

      // Add the word "ditherit" in the center as bright pixels
      const text = "ditherit";
      for (let ci = 0; ci < text.length; ci++) {
        for (let row = 0; row < 5; row++) {
          for (let col = 0; col < 4; col++) {
            const glyph = GLYPHS[text[ci]] || 0;
            const bit = (glyph >> ((4 - row) * 4 + (3 - col))) & 1;
            if (!bit) continue;
            const px = Math.round(cx - (text.length * 2.5) + ci * 5 + col);
            const py = Math.round(cy - 3 + row);
            if (px >= 0 && px < COLS && py >= 0 && py < ROWS) {
              offCtx.fillStyle = "#fff";
              offCtx.fillRect(px, py, 1, 1);
            }
          }
        }
      }
    };

    let startTime = performance.now();

    const render = (now: number) => {
      const elapsed = now - startTime;
      const scale = 1 + 0.15 * Math.sin(elapsed / 4000);
      const driftX = Math.sin(elapsed / 7000) * 3;
      const driftY = Math.cos(elapsed / 5000) * 2;

      drawLogo(scale, driftX, driftY);

      const imgData = offCtx.getImageData(0, 0, COLS, ROWS);
      const data = imgData.data;

      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, W, H);

      ctx.font = `${FONT_SIZE}px 'JetBrains Mono', monospace`;
      ctx.textBaseline = "top";

      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const idx = (row * COLS + col) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const brightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
          const charIdx = Math.floor(brightness * (CHARSET.length - 1));
          const char = CHARSET[charIdx];
          if (char === " ") continue;

          // Color based on violet palette
          const hue = 260 + brightness * 40;
          const sat = 60 + brightness * 40;
          const lit = 20 + brightness * 60;
          ctx.fillStyle = `hsl(${hue},${sat}%,${lit}%)`;
          ctx.fillText(char, col * FONT_SIZE * 0.6, row * FONT_SIZE);
        }
      }

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={420}
      height={360}
      className={className}
      style={{
        borderRadius: 12,
        display: "block",
      }}
    />
  );
}

// Minimal 4-wide pixel font (4 cols × 5 rows packed into 20-bit number)
// Row 0 is topmost. We store 5 rows of 4 bits each = 20 bits.
const GLYPHS: Record<string, number> = {
  d: 0b00010001100011000110111,
  i: 0b01100010001000100110,
  t: 0b11110100010001000110,
  h: 0b10011001111110011001,
  e: 0b01101001111110000111,
  r: 0b10111101110010101001,
};
