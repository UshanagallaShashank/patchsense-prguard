export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type ReviewStatus = "pending" | "running" | "completed" | "failed";
export type PrState = "open" | "closed" | "merged";

export interface Finding {
  id: string;
  agent: "security" | "performance" | "style";
  severity: Severity;
  file_path: string;
  line_number: number | null;
  message: string;
  suggestion: string | null;
  patch: string | null;
}

export interface Review {
  id: string;
  repo_full_name: string;
  pr_number: number;
  pr_title: string | null;
  head_branch: string | null;
  author_login: string | null;
  pr_state: PrState | null;
  status: ReviewStatus;
  created_at: string;
  completed_at: string | null;
  findings: Finding[];
}
