import type { Severity } from "../types/review";

const COLOR_MAP: Record<Severity, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#d97706",
  info: "#6b7280",
};

interface Props {
  severity: Severity;
}

// Renders a colored badge for a finding severity level
export function SeverityBadge({ severity }: Props) {
  return (
    <span style={{ color: COLOR_MAP[severity], fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase" }}>
      {severity}
    </span>
  );
}
