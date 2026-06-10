import type { Severity } from "../types/review";

const CLS: Record<Severity, string> = {
  critical: "text-red-400 bg-red-950/60 border-red-900/70",
  high:     "text-orange-400 bg-orange-950/60 border-orange-900/70",
  medium:   "text-yellow-400 bg-yellow-950/60 border-yellow-900/70",
  low:      "text-green-400 bg-green-950/60 border-green-900/70",
  info:     "text-blue-400 bg-blue-950/60 border-blue-900/70",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`inline-flex items-center border rounded px-1.5 py-0.5 text-[10px] font-bold tracking-widest uppercase whitespace-nowrap ${CLS[severity] ?? CLS.info}`}>
      {severity}
    </span>
  );
}
