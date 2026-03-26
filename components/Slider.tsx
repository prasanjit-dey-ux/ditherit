"use client";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  unit?: string;
  decimals?: number;
}

export default function Slider({
  label, value, min, max, step = 1, onChange, unit = "", decimals = 0
}: SliderProps) {
  const display = decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center">
        <span style={{ color: "var(--muted)", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.04em" }}>
          {label}
        </span>
        <span style={{ color: "var(--text)", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", minWidth: 40, textAlign: "right" }}>
          {display}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ accentColor: "var(--accent)" }}
      />
    </div>
  );
}
