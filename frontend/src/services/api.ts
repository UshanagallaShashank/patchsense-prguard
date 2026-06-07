import type { Review } from "../types/review";

const BASE = "/api";

// Fetches paginated list of reviews from the backend
export async function fetchReviews(page = 1): Promise<Review[]> {
  const res = await fetch(`${BASE}/reviews?page=${page}`);
  if (!res.ok) throw new Error("Failed to fetch reviews");
  return res.json();
}

// Fetches a single review with its findings by ID
export async function fetchReview(id: string): Promise<Review> {
  const res = await fetch(`${BASE}/reviews/${id}`);
  if (!res.ok) throw new Error("Failed to fetch review");
  return res.json();
}
