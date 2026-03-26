"use client";

interface ToggleProps {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

export default function Toggle({ label, value, onChange }: ToggleProps) {
  return (
    <div className="flex justify-between items-center">
      <span style={{ color: "var(--muted)", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.04em" }}>
        {label}
      </span>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 32,
          height: 18,
          borderRadius: 9,
          background: value ? "var(--accent)" : "var(--border)",
          border: "none",
          cursor: "pointer",
          position: "relative",
          transition: "background 0.2s",
          flexShrink: 0,
        }}
      >
        <span style={{
          position: "absolute",
          top: 3,
          left: value ? 17 : 3,
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.2s",
        }} />
      </button>
    </div>
  );
}