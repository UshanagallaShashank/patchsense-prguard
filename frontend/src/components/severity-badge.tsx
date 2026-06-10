import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const SEV_VARIANT: Record<string, "critical" | "high" | "medium" | "low" | "info"> = {
  critical: "critical",
  high:     "high",
  medium:   "medium",
  low:      "low",
  info:     "info",
}

export function SeverityBadge({ severity }: { severity: string }) {
  const variant = SEV_VARIANT[severity] ?? "info"
  return (
    <Badge variant={variant} className={cn("capitalize text-[11px]")}>
      {severity}
    </Badge>
  )
}
