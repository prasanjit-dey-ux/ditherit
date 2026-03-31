"use client";
import { useRef, useCallback } from "react";
import { motion } from "framer-motion";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  unit?: string;
  decimals?: number;
  displayValue?: string;
}

const DOT_COUNT = 5;

export default function Slider({
  label, value, min, max, step = 1, onChange, unit = "", decimals = 0, displayValue
}: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const display = displayValue ?? (decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString());

  const clamp = useCallback((clientX: number) => {
    if (!trackRef.current) return value;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    let v = min + ratio * (max - min);
    if (step) v = Math.round(v / step) * step;
    v = Math.max(min, Math.min(max, v));
    return decimals > 0 ? parseFloat(v.toFixed(decimals)) : Math.round(v);
  }, [value, min, max, step, decimals]);

  const onDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    onChange(clamp(e.clientX));
  }, [clamp, onChange]);

  const onMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    onChange(clamp(e.clientX));
  }, [clamp, onChange]);

  const onUp = useCallback(() => { dragging.current = false; }, []);

  const thumbPct = ((value - min) / (max - min)) * 100;

  return (
    <div
      ref={trackRef}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      style={{
        position: "relative",
        background: "var(--row-bg)",
        borderRadius: 10,
        height: 36,
        marginBottom: 4,
        cursor: "ew-resize",
        display: "flex",
        alignItems: "center",
        overflow: "hidden",
        userSelect: "none",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = "var(--row-bg-hover, var(--border))"}
      onMouseLeave={(e) => e.currentTarget.style.background = "var(--row-bg)"}
    >
      {/* Decorative Track Dots (Base Layer) */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
        display: "flex", alignItems: "center", justifyContent: "space-evenly"
      }}>
        {Array.from({ length: DOT_COUNT }).map((_, i) => (
          <span key={i} style={{
            display: "block", width: 4, height: 4, borderRadius: "50%",
            background: "var(--row-divider)"
          }} />
        ))}
      </div>

      {/* Dynamic Progress Fill Pill (Middle Layer) */}
      <div style={{
        position: "absolute",
        left: 0,
        top: 0,
        height: "100%",
        width: `${Math.max(0, Math.min(100, thumbPct))}%`,
        background: "var(--row-label-bg)",
        borderRadius: 10,  /* rounded on the right edge as it shrinks */
        pointerEvents: "none",
        zIndex: 1,
      }}>
        {/* Subtle vertical marker indicator inside the fill's right edge */}
        <div style={{
          position: "absolute",
          right: 6,
          top: "50%",
          transform: "translateY(-50%)",
          width: 2,
          height: 16,
          borderRadius: 2,
          background: "var(--accent)",
        }} />
      </div>

      {/* Label and Value Text (Top Layer) */}
      <span style={{
        position: "absolute", left: 12, pointerEvents: "none", zIndex: 2,
        fontSize: 11, fontFamily: "'Inter',sans-serif", fontWeight: 500,
        color: "var(--muted)", letterSpacing: "-0.01em"
      }}>
        {label.charAt(0).toUpperCase() + label.slice(1).toLowerCase()}
      </span>

      <span style={{
        position: "absolute", right: 12, pointerEvents: "none", zIndex: 2,
        fontSize: 11, fontFamily: "'JetBrains Mono',monospace",
        color: "var(--text)"
      }}>
        {display}{unit}
      </span>
    </div>
  );
}
