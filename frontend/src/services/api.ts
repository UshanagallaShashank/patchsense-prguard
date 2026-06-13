import type { Review } from "../types/review";

// VITE_API_URL: set to backend origin in production (e.g. https://your-app.onrender.com)
// Leave unset for local dev — Vite proxy rewrites /api → http://localhost:8000
export const BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : "/api";

// Returns human-readable error message from a failed response
async function extractError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.detail ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

// Fetches paginated list of reviews from the backend
export async function fetchReviews(page = 1): Promise<Review[]> {
  const res = await fetch(`${BASE}/reviews?page=${page}`);
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

// Fetches a single review with its findings by ID
export async function fetchReview(id: string): Promise<Review> {
  const res = await fetch(`${BASE}/reviews/${id}`);
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

// Ask AI to generate a patch for a finding
export async function generateFix(reviewId: string, findingId: string): Promise<{ patch: string; file_path: string }> {
  const res = await fetch(`${BASE}/reviews/${reviewId}/findings/${findingId}/fix`, { method: "POST" });
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

// Apply a patch — commit directly or open a fix PR
export async function applyFix(
  reviewId: string,
  findingId: string,
  mode: "commit" | "pr",
): Promise<{ mode: string; branch?: string; pr_url?: string; pr_number?: number }> {
  const res = await fetch(`${BASE}/reviews/${reviewId}/apply-fix`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  const res = await fetch(`${BASE}/reviews/${reviewId}/conflict-details`);
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

// Merge the PR associated with a review
export async function mergePr(reviewId: string): Promise<{ merged: boolean }> {
  const res = await fetch(`${BASE}/reviews/${reviewId}/merge`, { method: "POST" });
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}
