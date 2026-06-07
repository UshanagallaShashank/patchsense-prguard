import { useEffect, useState } from "react";
import type { Review } from "../types/review";
import { fetchReviews } from "../services/api";

// Fetches and returns paginated review list with loading and error state
export function useReviews(page: number) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchReviews(page)
      .then(setReviews)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page]);

  return { reviews, loading, error };
}
