import type { Review } from "../types/review";
import { supabase } from "../lib/supabase";

export const BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : "/api";

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function extractError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.detail ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

async function fetchWithAuth(url: string, init: RequestInit = {}): Promise<Response> {
  const base = (init.headers as Record<string, string>) ?? {};
  const headers = { ...base, ...(await authHeaders()) };
  const res = await fetch(url, { ...init, headers });

  if (res.status === 401) {
    // Try to refresh the session once and retry
    const { error } = await supabase.auth.refreshSession();
    if (!error) {
      const freshHeaders = { ...base, ...(await authHeaders()) };
      const retry = await fetch(url, { ...init, headers: freshHeaders });
      if (retry.status !== 401) return retry;
    }
    // Refresh failed or retry still 401 — sign out so ProtectedRoute sends user to /login
    await supabase.auth.signOut();
    throw new Error("Session expired. Please sign in again.");
  }

  return res;
}

// ── reviews ───────────────────────────────────────────────────────────────────

export async function fetchReviews(page = 1): Promise<Review[]> {
  const res = await fetchWithAuth(`${BASE}/reviews?page=${page}`);
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

export async function fetchReview(id: string): Promise<Review> {
  const res = await fetchWithAuth(`${BASE}/reviews/${id}`);
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

export async function fixAllFindings(reviewId: string): Promise<{ pr_url: string; pr_number: number; applied: number; skipped: number }> {
  const { data } = await supabase.auth.getSession();
  const ghToken = data.session?.provider_token;
  const res = await fetchWithAuth(`${BASE}/reviews/${reviewId}/fix-all`, {
    method: "POST",
    headers: ghToken ? { "X-GitHub-Token": ghToken } : {},
  });
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

export async function generateFix(reviewId: string, findingId: string): Promise<{ patch: string; file_path: string }> {
  const res = await fetchWithAuth(`${BASE}/reviews/${reviewId}/findings/${findingId}/fix`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

export async function applyFix(
  reviewId: string,
  findingId: string,
  mode: "commit" | "pr",
): Promise<{ mode: string; branch?: string; pr_url?: string; pr_number?: number }> {
  const { data } = await supabase.auth.getSession();
  const ghToken = data.session?.provider_token;
  const res = await fetchWithAuth(`${BASE}/reviews/${reviewId}/apply-fix`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(ghToken ? { "X-GitHub-Token": ghToken } : {}),
    },
    body: JSON.stringify({ finding_id: findingId, mode }),
  });
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

export interface ConflictFile {
  filename: string;
  head_content: string | null;
  base_content: string | null;
  diff: string | null;
}

export interface ConflictDetails {
  head_branch: string;
  base_branch: string;
  files: ConflictFile[];
}

export async function fetchConflictDetails(reviewId: string): Promise<ConflictDetails> {
  const res = await fetchWithAuth(`${BASE}/reviews/${reviewId}/conflict-details`);
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

export async function mergePr(reviewId: string): Promise<{ merged: boolean }> {
  const res = await fetchWithAuth(`${BASE}/reviews/${reviewId}/merge`, { method: "POST" });
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

// ── repos ─────────────────────────────────────────────────────────────────────

export interface ConnectedRepo {
  id: string;
  full_name: string;
  connected_at: string;
  webhook_id: number | null;
  active: boolean;
  is_owner: boolean;
  owner_login?: string;
}

export async function fetchRepos(): Promise<ConnectedRepo[]> {
  const res = await fetchWithAuth(`${BASE}/repos`);
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

export async function connectRepo(repoUrl: string): Promise<{ full_name: string; status: string }> {
  const { data } = await supabase.auth.getSession();
  const githubToken = data.session?.provider_token;
  const res = await fetchWithAuth(`${BASE}/repos/connect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(githubToken ? { "X-GitHub-Token": githubToken } : {}),
    },
    body: JSON.stringify({ repo_url: repoUrl }),
  });
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

export async function toggleRepoActive(repoId: string, active: boolean): Promise<void> {
  const res = await fetchWithAuth(`${BASE}/repos/${repoId}/active`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active }),
  });
  if (!res.ok) throw new Error(await extractError(res));
}

export async function disconnectRepo(repoId: string): Promise<void> {
  const res = await fetchWithAuth(`${BASE}/repos/${repoId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await extractError(res));
}

export interface RepoMember {
  user_id: string;
  github_login: string;
  role: string;
  invited_at: string;
}

export async function fetchMembers(repoId: string): Promise<RepoMember[]> {
  const res = await fetchWithAuth(`${BASE}/repos/${repoId}/members`);
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

export async function inviteMember(repoId: string, githubLogin: string, role = "member"): Promise<void> {
  const res = await fetchWithAuth(`${BASE}/repos/${repoId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ github_login: githubLogin, role }),
  });
  if (!res.ok) throw new Error(await extractError(res));
}

export async function removeMember(repoId: string, githubLogin: string): Promise<void> {
  const res = await fetchWithAuth(`${BASE}/repos/${repoId}/members/${githubLogin}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await extractError(res));
}

// ── me ────────────────────────────────────────────────────────────────────────

export interface Me {
  id: string;
  email: string;
  github_login: string;
  avatar_url: string;
  plan: "free" | "pro" | "team";
  is_admin: boolean;
}

export async function fetchMe(): Promise<Me> {
  const res = await fetchWithAuth(`${BASE}/me`);
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

export async function updateMyPlan(plan: string): Promise<void> {
  const res = await fetchWithAuth(`${BASE}/me/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan }),
  });
  if (!res.ok) throw new Error(await extractError(res));
}

export async function adminSetPlan(userId: string, plan: string): Promise<void> {
  const res = await fetchWithAuth(`${BASE}/admin/set-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, plan }),
  });
  if (!res.ok) throw new Error(await extractError(res));
}

// ── admin ─────────────────────────────────────────────────────────────────────

export interface AdminRepo {
  id: string;
  full_name: string;
  active: boolean;
  connected_at: string;
  review_count: number;
}

export interface AdminUser {
  id: string;
  github_login: string | null;
  github_avatar_url: string | null;
  plan: string;
  is_admin: boolean;
  created_at: string;
  repo_count: number;
  repos: AdminRepo[];
}

export interface AdminStats {
  users: { total: number; by_plan: Record<string, number> };
  repos: { total: number; active: number; inactive: number; no_webhook: number };
  reviews: { total: number; completed: number; failed: number; by_status: Record<string, number> };
  revenue: { mrr_estimate: number };
}

export interface AdminActivity {
  id: string;
  repo_full_name: string;
  pr_number: number;
  pr_title: string | null;
  status: string;
  pr_state: string | null;
  created_at: string;
  author_login: string | null;
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const res = await fetchWithAuth(`${BASE}/admin/users`);
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

export async function fetchAdminStats(): Promise<AdminStats> {
  const res = await fetchWithAuth(`${BASE}/admin/stats`);
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

export async function fetchAdminActivity(): Promise<AdminActivity[]> {
  const res = await fetchWithAuth(`${BASE}/admin/activity`);
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

// ── risk / feedback / slack ───────────────────────────────────────────────────

export async function submitFeedback(
  reviewId: string,
  findingId: string,
  verdict: "false_positive" | "valid",
): Promise<void> {
  const res = await fetchWithAuth(`${BASE}/reviews/${reviewId}/findings/${findingId}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ verdict }),
  });
  if (!res.ok) throw new Error(await extractError(res));
}

// ── custom rules ─────────────────────────────────────────────────────────────

export interface CustomRule {
  id: string
  rule_text: string
  enabled: boolean
  created_at: string
}

export async function fetchCustomRules(repoId: string): Promise<CustomRule[]> {
  const res = await fetchWithAuth(`${BASE}/repos/${repoId}/rules`)
  if (!res.ok) throw new Error(await extractError(res))
  return res.json()
}

export async function createCustomRule(repoId: string, ruleText: string): Promise<CustomRule> {
  const res = await fetchWithAuth(`${BASE}/repos/${repoId}/rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rule_text: ruleText }),
  })
  if (!res.ok) throw new Error(await extractError(res))
  return res.json()
}

export async function toggleCustomRule(repoId: string, ruleId: string): Promise<{ id: string; enabled: boolean }> {
  const res = await fetchWithAuth(`${BASE}/repos/${repoId}/rules/${ruleId}`, { method: "PATCH" })
  if (!res.ok) throw new Error(await extractError(res))
  return res.json()
}

export async function deleteCustomRule(repoId: string, ruleId: string): Promise<void> {
  const res = await fetchWithAuth(`${BASE}/repos/${repoId}/rules/${ruleId}`, { method: "DELETE" })
  if (!res.ok) throw new Error(await extractError(res))
}

export async function setSlackWebhook(repoId: string, webhookUrl: string | null): Promise<void> {
  const res = await fetchWithAuth(`${BASE}/repos/${repoId}/slack-webhook`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ webhook_url: webhookUrl }),
  });
  if (!res.ok) throw new Error(await extractError(res));
}
