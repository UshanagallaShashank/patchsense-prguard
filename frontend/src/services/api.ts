import type { Review } from "../types/review";
import { supabase } from "../lib/supabase";

// VITE_API_URL: set to backend origin in production (e.g. https://your-app.onrender.com)
// Leave unset for local dev — Vite proxy rewrites /api → http://localhost:8000
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

// ── reviews ───────────────────────────────────────────────────────────────────

export async function fetchReviews(page = 1): Promise<Review[]> {
  const res = await fetch(`${BASE}/reviews?page=${page}`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

export async function fetchReview(id: string): Promise<Review> {
  const res = await fetch(`${BASE}/reviews/${id}`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

export async function generateFix(reviewId: string, findingId: string): Promise<{ patch: string; file_path: string }> {
  const res = await fetch(`${BASE}/reviews/${reviewId}/findings/${findingId}/fix`, {
    method: "POST",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

export async function applyFix(
  reviewId: string,
  findingId: string,
  mode: "commit" | "pr",
): Promise<{ mode: string; branch?: string; pr_url?: string; pr_number?: number }> {
  const res = await fetch(`${BASE}/reviews/${reviewId}/apply-fix`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
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
  const res = await fetch(`${BASE}/reviews/${reviewId}/conflict-details`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

export async function mergePr(reviewId: string): Promise<{ merged: boolean }> {
  const res = await fetch(`${BASE}/reviews/${reviewId}/merge`, {
    method: "POST",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

// ── repos ─────────────────────────────────────────────────────────────────────

export interface ConnectedRepo {
  id: string;
  full_name: string;
  connected_at: string;
  webhook_id: number | null;
}

export async function fetchRepos(): Promise<ConnectedRepo[]> {
  const res = await fetch(`${BASE}/repos`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

export async function connectRepo(repoUrl: string): Promise<{ full_name: string; status: string }> {
  const res = await fetch(`${BASE}/repos/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ repo_url: repoUrl }),
  });
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

export async function disconnectRepo(repoId: string): Promise<void> {
  const res = await fetch(`${BASE}/repos/${repoId}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await extractError(res));
}

export interface RepoMember {
  user_id: string;
  github_login: string;
  role: string;
  invited_at: string;
}

export async function fetchMembers(repoId: string): Promise<RepoMember[]> {
  const res = await fetch(`${BASE}/repos/${repoId}/members`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

export async function inviteMember(repoId: string, githubLogin: string, role = "member"): Promise<void> {
  const res = await fetch(`${BASE}/repos/${repoId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ github_login: githubLogin, role }),
  });
  if (!res.ok) throw new Error(await extractError(res));
}

export async function removeMember(repoId: string, githubLogin: string): Promise<void> {
  const res = await fetch(`${BASE}/repos/${repoId}/members/${githubLogin}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await extractError(res));
}

// ── me ────────────────────────────────────────────────────────────────────────

export interface Me {
  id: string;
  email: string;
  github_login: string;
  avatar_url: string;
  plan: "free" | "pro" | "team";
  bypass_plan: boolean;
}

export async function fetchMe(): Promise<Me> {
  const res = await fetch(`${BASE}/me`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

export async function adminSetPlan(userId: string, plan: string, bypassPlan = false): Promise<void> {
  const res = await fetch(`${BASE}/admin/set-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ user_id: userId, plan, bypass_plan: bypassPlan }),
  });
  if (!res.ok) throw new Error(await extractError(res));
}
