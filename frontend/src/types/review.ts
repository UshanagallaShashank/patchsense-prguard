export type Severity = "critical" | "high" | "medium" | "info";
export type ReviewStatus = "pending" | "running" | "done" | "failed";

export interface Finding {
  id: string;
  agent: "security" | "performance" | "style";
  severity: Severity;
  file_path: string;
  line_number: number | null;
  message: string;
  suggestion: string | null;
}

export interface Review {
  id: string;
  repo_full_name: string;
  pr_number: number;
  status: ReviewStatus;
  created_at: string;
  completed_at: string | null;
  findings: Finding[];
}
