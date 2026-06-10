import { useEffect, useRef, useState } from "react";
import type { Review } from "../types/review";
import { fetchReviews } from "../services/api";

const ACTIVE = new Set(["pending", "running"]);

export function useReviews(page: number) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    fetchReviews(page)
      .then(data => { setReviews(data); setError(null); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(true);
  }, [page]);

  // Poll every 4s while any review is pending/running
  useEffect(() => {
    const hasActive = reviews.some(r => ACTIVE.has(r.status));
    if (hasActive) {
      timer.current = setInterval(() => load(), 4000);
    } else {
      if (timer.current) clearInterval(timer.current);
    }
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [reviews]);

  return { reviews, loading, error, refresh: () => load() };
}
