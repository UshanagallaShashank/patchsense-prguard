import type { Severity } from "../types/review";

const CFG: Record<Severity, { bg: string; color: string; glow: string }> = {
  critical: { bg: "#2d1117", color: "#f85149", glow: "#f8514933" },
  high:     { bg: "#2d1b0e", color: "#fb8f44", glow: "#fb8f4433" },
  medium:   { bg: "#271d05", color: "#d29922", glow: "#d2992233" },
  low:      { bg: "#0d2114", color: "#3fb950", glow: "#3fb95033" },
  info:     { bg: "#0d1a2d", color: "#58a6ff", glow: "#58a6ff33" },
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const c = CFG[severity] ?? CFG.info;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: c.bg,
      color: c.color,
      border: `1px solid ${c.glow}`,
      borderRadius: 6,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: "0.08em",
      padding: "2px 8px",
      textTransform: "uppercase",
      whiteSpace: "nowrap",
      boxShadow: `0 0 8px ${c.glow}`,
    }}>
      {severity}
    </span>
  );
}
