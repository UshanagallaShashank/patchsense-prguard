import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Review } from "../types/review";
import { fetchReviews } from "../services/api";

const FALLBACK_POLL_MS = 5000;

export function useReviews(page: number) {
  const [reviews, setReviews]   = useState<Review[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const prevStatuses            = useRef<Record<string, string>>({});
  const esRef                   = useRef<EventSource | null>(null);
  const fallbackTimerRef        = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep callbacks in refs so the effect never needs them as deps
  const applyReviewsRef = useRef<(data: Review[]) => void>(null!);
  applyReviewsRef.current = (data: Review[]) => {
    data.forEach(r => {
      const prev = prevStatuses.current[r.id];
      if (prev && prev !== r.status) {
        const title = r.pr_title ?? `PR #${r.pr_number}`;
        if (r.status === "failed") {
          toast.error(`Review failed — ${title}`, {
            description: "The AI agents encountered an error. Check logs.",
            duration: 8000,
            action: { label: "Dismiss", onClick: () => {} },
          });
        } else if (r.status === "completed") {
          const n = r.findings.length;
          toast.success(`Review complete — ${title}`, {
            description: n > 0 ? `${n} finding${n !== 1 ? "s" : ""} found` : "No issues — clean PR 🎉",
            duration: 5000,
          });
        }
      }
      prevStatuses.current[r.id] = r.status;
    });
    setReviews(data);
    setError(null);
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);

    const cleanup = () => {
      esRef.current?.close();
      esRef.current = null;
      if (fallbackTimerRef.current) {
        clearInterval(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
    };

    const startFallbackPoll = (p: number) => {
      if (fallbackTimerRef.current) return;
      fetchReviews(p).then(applyReviewsRef.current).catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
      fallbackTimerRef.current = setInterval(() => {
        fetchReviews(p).then(applyReviewsRef.current).catch(() => {});
      }, FALLBACK_POLL_MS);
    };

    // SSE on page 1 for real-time updates; plain fetch for other pages
    if (page === 1) {
      const es = new EventSource("/api/reviews/stream");
      esRef.current = es;

      es.onmessage = (e: MessageEvent<string>) => {
        try { applyReviewsRef.current(JSON.parse(e.data) as Review[]); } catch { /* ignore parse errors */ }
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        startFallbackPoll(1);
      };
    } else {
      fetchReviews(page)
        .then(applyReviewsRef.current)
        .catch((e: Error) => {
          setError(e.message);
          setLoading(false);
        });
    }

    return cleanup;
  }, [page]);

  const refresh = useCallback(() => {
    fetchReviews(page).then(applyReviewsRef.current).catch(() => {});
  }, [page]);

  return { reviews, loading, error, refresh };
}
