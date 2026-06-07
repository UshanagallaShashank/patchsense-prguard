import { useState } from "react";
import { useReviews } from "../hooks/use-reviews";
import { SeverityBadge } from "../components/severity-badge";

// Displays paginated list of PR reviews with status and finding counts
export function ReviewsPage() {
  const [page, setPage] = useState(1);
  const { reviews, loading, error } = useReviews(page);

  if (loading) return <p>Loading reviews…</p>;
  if (error) return <p>Error: {error}</p>;

  return (
    <div>
      <h1>PR Reviews</h1>
      {reviews.map((r) => (
        <div key={r.id} style={{ borderBottom: "1px solid #eee", padding: "1rem 0" }}>
          <strong>{r.repo_full_name} #{r.pr_number}</strong>
          <span> — {r.status}</span>
          {r.findings.map((f) => (
            <div key={f.id}><SeverityBadge severity={f.severity} /> {f.file_path}: {f.message}</div>
          ))}
        </div>
      ))}
      <button onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
      <button onClick={() => setPage((p) => p + 1)}>Next</button>
    </div>
  );
}
