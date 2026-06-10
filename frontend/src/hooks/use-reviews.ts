import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Review } from "../types/review";
import { fetchReviews } from "../services/api";

const ACTIVE = new Set(["pending", "running"]);

export function useReviews(page: number) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const prevStatuses          = useRef<Record<string, string>>({});
  const timer                 = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    fetchReviews(page)
      .then(data => {
        data.forEach(r => {
          const prev = prevStatuses.current[r.id];
          if (prev && prev !== r.status) {
            if (r.status === "failed") {
              toast.error(`Review failed — PR #${r.pr_number}`, {
                description: "The AI agents encountered an error. Check Render logs.",
                duration: 8000,
                action: { label: "Dismiss", onClick: () => {} },
              });
            } else if (r.status === "completed") {
              const n = r.findings.length;
              toast.success(`Review complete — PR #${r.pr_number}`, {
                description: n > 0 ? `${n} finding${n !== 1 ? "s" : ""} found` : "No issues — clean PR 🎉",
                duration: 5000,
              });
            }
          }
          prevStatuses.current[r.id] = r.status;
        });
        setReviews(data);
        setError(null);
      })
      .catch((e: Error) => {
        setError(e.message);
        toast.error("Failed to load reviews", { description: e.message });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(true); }, [page]);

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
