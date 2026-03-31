"use client";

interface ToggleProps {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

export default function Toggle({ label, value, onChange }: ToggleProps) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "var(--row-bg)", borderRadius: 10,
        height: 36, padding: "0 12px", marginBottom: 4,
        cursor: "pointer", userSelect: "none", transition: "background 0.15s",
      }}
      onClick={() => onChange(!value)}
      onMouseEnter={(e) => e.currentTarget.style.background = "var(--row-bg-hover, var(--border))"}
      onMouseLeave={(e) => e.currentTarget.style.background = "var(--row-bg)"}
    >
      <span style={{
        fontSize: 11, fontFamily: "'Inter',sans-serif", fontWeight: 500,
        color: "var(--muted)", letterSpacing: "-0.01em",
      }}>
        {label.charAt(0).toUpperCase() + label.slice(1).toLowerCase()}
      </span>

      <div style={{
        width: 32, height: 18, borderRadius: 18,
        background: value ? "var(--accent)" : "var(--row-divider)",
        position: "relative",
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      }}>
        <div
          style={{
            position: "absolute", top: 3, width: 12, height: 12,
            left: value ? 17 : 3,
            background: "#fff", borderRadius: "50%",
            boxShadow: "0px 1px 3px rgba(0,0,0,0.2)",
            transition: "left 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      </div>
    </div>
  );
}