import type { Review } from "../types/review";

const BASE = "/api";

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
