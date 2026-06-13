import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Review } from "../types/review";
import { fetchReviews, BASE } from "../services/api";
import { supabase } from "../lib/supabase";

const FALLBACK_POLL_MS = 5000;

export function useReviews(page: number) {
  const [reviews, setReviews]   = useState<Review[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const prevStatuses            = useRef<Record<string, string>>({});
  const esRef                   = useRef<EventSource | null>(null);
  const fallbackTimerRef        = useRef<ReturnType<typeof setInterval> | null>(null);

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
    let cancelled = false;

    const closeEs = () => {
      esRef.current?.close();
      esRef.current = null;
    };

    const stopPoll = () => {
      if (fallbackTimerRef.current) {
        clearInterval(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
    };

    const cleanup = () => {
      cancelled = true;
      closeEs();
      stopPoll();
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

    if (page === 1) {
      // EventSource cannot send Authorization headers — pass JWT as ?token=
      supabase.auth.getSession().then(({ data: sessionData }) => {
        if (cancelled) return;

        const token = sessionData.session?.access_token;
        if (!token) {
          // No session: fall back to polling (will 401 too, but gives a clear error)
          startFallbackPoll(1);
          return;
        }

        const url = `${BASE}/reviews/stream?token=${encodeURIComponent(token)}`;
        const es = new EventSource(url);
        esRef.current = es;

        es.onmessage = (e: MessageEvent<string>) => {
          try { applyReviewsRef.current(JSON.parse(e.data) as Review[]); } catch { /* ignore */ }
        };

        es.onerror = () => {
          closeEs();
          if (!cancelled) startFallbackPoll(1);
        };
      });
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
