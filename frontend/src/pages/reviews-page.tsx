import { useState } from "react";
import { useReviews } from "../hooks/use-reviews";
import { SeverityBadge } from "../components/severity-badge";
import type { Finding, Review, ReviewStatus } from "../types/review";

/* ── config ──────────────────────────────────────────────────── */

const AGENT = {
  security:    { icon: "🔒", label: "Security",    color: "text-red-400",    bg: "bg-red-950/40",    border: "border-red-900/50"    },
  performance: { icon: "⚡", label: "Performance", color: "text-yellow-400", bg: "bg-yellow-950/40", border: "border-yellow-900/50" },
  style:       { icon: "✦",  label: "Style",        color: "text-purple-400", bg: "bg-purple-950/40", border: "border-purple-900/50" },
} as const;

const STATUS: Record<ReviewStatus, { dot: string; text: string; label: string; pulse: boolean }> = {
  completed: { dot: "bg-green-500",  text: "text-green-400",  label: "Completed", pulse: false },
  pending:   { dot: "bg-yellow-500", text: "text-yellow-400", label: "Pending",   pulse: true  },
  running:   { dot: "bg-blue-500",   text: "text-blue-400",   label: "Running",   pulse: true  },
  failed:    { dot: "bg-red-500",    text: "text-red-400",    label: "Failed",    pulse: false },
};

const SEV_CHIP: Record<string, string> = {
  critical: "text-red-400 bg-red-950/50 border-red-900/60",
  high:     "text-orange-400 bg-orange-950/50 border-orange-900/60",
  medium:   "text-yellow-400 bg-yellow-950/50 border-yellow-900/60",
  low:      "text-green-400 bg-green-950/50 border-green-900/60",
  info:     "text-blue-400 bg-blue-950/50 border-blue-900/60",
};

const STATUS_FILTERS = [
  { key: "all",       label: "All",       active: "border-[#8b949e] bg-[#8b949e]/10 text-[#8b949e]" },
  { key: "pending",   label: "Pending",   active: "border-yellow-700 bg-yellow-950/40 text-yellow-400" },
  { key: "running",   label: "Running",   active: "border-blue-700 bg-blue-950/40 text-blue-400"    },
  { key: "completed", label: "Completed", active: "border-green-700 bg-green-950/40 text-green-400" },
  { key: "failed",    label: "Failed",    active: "border-red-700 bg-red-950/40 text-red-400"       },
];

const AGENT_FILTERS = [
  { key: "all",         label: "All",         icon: "◈" },
  { key: "security",    label: "Security",    icon: "🔒" },
  { key: "performance", label: "Performance", icon: "⚡" },
  { key: "style",       label: "Style",       icon: "✦"  },
];

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return "just now";
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/* ── SettingsDrawer ──────────────────────────────────────────── */

function CopyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mb-5">
      <p className="text-xs font-bold text-[#8b949e] uppercase tracking-widest mb-2">{label}</p>
      <div className="flex gap-2">
        <code className="flex-1 bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-blue-400 font-mono break-all leading-relaxed">
          {value}
        </code>
        <button
          onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className={`shrink-0 px-3 rounded-lg border text-xs font-medium transition-all ${copied ? "border-green-700 bg-green-950/50 text-green-400" : "border-[#30363d] bg-[#161b22] text-[#8b949e] hover:text-[#e6edf3]"}`}
        >
          {copied ? "✓" : "Copy"}
        </button>
      </div>
      {hint && <p className="text-xs text-[#484f58] mt-1.5">{hint}</p>}
    </div>
  );
}

function SettingsDrawer({ onClose }: { onClose: () => void }) {
  const steps = [
    "Go to GitHub repo → Settings → Webhooks → Add webhook",
    "Set Payload URL to the deployed webhook URL below",
    "Set Content type to application/json",
    "Set Secret to: patchsense123",
    'Under events → "Let me select individual events" → tick Pull requests only',
    "Click Add webhook — every new PR auto-triggers a review",
  ];
  return (
    <>
      <div onClick={onClose} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />
      <aside className="fixed top-0 right-0 bottom-0 w-[420px] bg-[#161b22] border-l border-[#30363d] z-50 overflow-y-auto p-6 animate-slide-down">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-base font-bold text-[#e6edf3]">⚙️ Connect a Repo</h2>
          <button onClick={onClose} className="text-[#8b949e] hover:text-[#e6edf3] text-lg px-1">✕</button>
        </div>
        <p className="text-sm text-[#8b949e] leading-relaxed mb-6">
          Add the webhook to any repo — PatchSense reviews every PR automatically. Works across multiple repos at once.
        </p>
        <div className="bg-[#0d1117] border border-[#21262d] rounded-xl p-4 mb-6">
          <p className="text-xs font-bold text-[#8b949e] uppercase tracking-widest mb-3">Setup steps</p>
          <ol className="space-y-2.5">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-3 items-start">
                <span className="shrink-0 w-5 h-5 rounded-full bg-blue-950 border border-blue-900/60 text-blue-400 text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                <span className="text-sm text-[#cdd9e5] leading-relaxed">{s}</span>
              </li>
            ))}
          </ol>
        </div>
        <CopyField label="Webhook URL (deployed)" value="https://patchsense-prguard-1.onrender.com/webhook" hint="Use for production" />
        <CopyField label="Webhook Secret" value="patchsense123" hint="Paste into the GitHub webhook secret field" />
        <div className="bg-blue-950/30 border border-blue-900/40 rounded-xl p-4 mt-2">
          <p className="text-xs text-blue-400 leading-relaxed">
            💡 <strong>Multi-repo:</strong> add the same webhook to as many repos as you want. Each review is tagged by <code className="bg-[#0d1117] px-1 rounded">repo_full_name</code> and shows up here.
          </p>
        </div>
      </aside>
    </>
  );
}

/* ── FindingRow ──────────────────────────────────────────────── */

function FindingRow({ f }: { f: Finding }) {
  const [open, setOpen] = useState(false);
  const a = AGENT[f.agent as keyof typeof AGENT];
  return (
    <div onClick={() => f.suggestion && setOpen(o => !o)} className={`py-3 border-b border-[#1c2128] last:border-0 ${f.suggestion ? "cursor-pointer" : ""}`}>
      <div className="flex gap-3 items-start">
        <div className={`w-7 h-7 rounded-lg shrink-0 mt-0.5 flex items-center justify-center text-sm ${a?.bg ?? "bg-[#161b22]"} border ${a?.border ?? "border-[#30363d]"}`}>
          {a?.icon ?? "•"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
            <SeverityBadge severity={f.severity} />
            <span className="text-[11px] text-[#8b949e] font-mono bg-[#0d1117] border border-[#21262d] rounded px-1.5 py-0.5 max-w-[220px] truncate">
              {f.file_path}{f.line_number != null ? `:${f.line_number}` : ""}
            </span>
            {a && (
              <span className={`text-[10px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded border ${a.bg} ${a.color} ${a.border}`}>
                {a.label}
              </span>
            )}
          </div>
          <p className="text-sm text-[#cdd9e5] leading-relaxed">{f.message}</p>
          {open && f.suggestion && (
            <div className="mt-2 px-3 py-2.5 bg-gradient-to-r from-green-950/40 to-blue-950/20 border border-green-900/40 rounded-lg text-xs text-green-400 leading-relaxed animate-slide-down">
              💡 {f.suggestion}
            </div>
          )}
        </div>
        {f.suggestion && <span className="text-[#484f58] text-[10px] mt-1.5 shrink-0">{open ? "▲" : "▼"}</span>}
      </div>
    </div>
  );
}

/* ── ReviewCard ──────────────────────────────────────────────── */

function ReviewCard({ r, agentFilter }: { r: Review; agentFilter: string }) {
  const [expanded, setExpanded] = useState(false);
  const st = STATUS[r.status] ?? STATUS.pending;
  const findings = agentFilter === "all" ? r.findings : r.findings.filter(f => f.agent === agentFilter);

  const sevCounts = ["critical", "high", "medium", "low", "info"].reduce<Record<string, number>>((a, s) => {
    const n = r.findings.filter(f => f.severity === s).length;
    if (n) a[s] = n;
    return a;
  }, {});

  const agentCounts = Object.keys(AGENT).reduce<Record<string, number>>((a, k) => {
    const n = r.findings.filter(f => f.agent === k).length;
    if (n) a[k] = n;
    return a;
  }, {});

  return (
    <div className={`bg-gradient-to-b from-[#161b22] to-[#0d1117] border rounded-2xl mb-3 overflow-hidden transition-shadow ${expanded ? "shadow-2xl shadow-black/40" : ""} ${r.status === "failed" ? "border-red-900/60" : "border-[#21262d]"}`}>
      <div onClick={() => setExpanded(e => !e)} className="p-4 cursor-pointer select-none">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl shrink-0 bg-gradient-to-br from-blue-950 to-blue-900/50 border border-blue-900/40 flex items-center justify-center text-base">🔀</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#e6edf3] leading-snug mb-1">{r.pr_title ?? `PR #${r.pr_number}`}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-[#8b949e] truncate">{r.repo_full_name}</span>
              <span className="text-xs text-[#8b949e] bg-[#21262d] rounded-full px-2 py-0.5">PR #{r.pr_number}</span>
              {r.pr_state === "merged" && (
                <span className="text-[10px] font-bold text-purple-400 bg-purple-950/40 border border-purple-900/40 rounded-full px-2 py-0.5">⇢ Merged</span>
              )}
              {r.pr_state === "closed" && (
                <span className="text-[10px] font-bold text-red-400 bg-red-950/40 border border-red-900/40 rounded-full px-2 py-0.5">✕ Closed</span>
              )}
              <span className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${st.dot} ${st.pulse ? "animate-pulse-dot" : ""}`} />
                <span className={`text-[11px] font-semibold ${st.text}`}>{st.label}</span>
              </span>
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {Object.entries(sevCounts).map(([s, n]) => (
                <span key={s} className={`text-[11px] border rounded-full px-2 py-0.5 ${SEV_CHIP[s] ?? SEV_CHIP.info}`}>{n} {s}</span>
              ))}
              {Object.entries(agentCounts).map(([a, n]) => {
                const cfg = AGENT[a as keyof typeof AGENT];
                return <span key={a} className="text-[11px] text-[#8b949e]">{cfg.icon} {n} {cfg.label.toLowerCase()}</span>;
              })}
              {r.findings.length === 0 && r.status === "completed" && <span className="text-[11px] text-green-400">✓ Clean PR</span>}
              {(r.status === "pending" || r.status === "running") && (
                <span className={`text-[11px] ${st.text} animate-pulse-dot`}>{r.status === "running" ? "Agents running…" : "Waiting for agents…"}</span>
              )}
              <span className="text-[11px] text-[#484f58] ml-auto">{timeAgo(r.created_at)}</span>
            </div>
          </div>
          <span className="text-[#484f58] text-[10px] mt-1 shrink-0">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[#1c2128] px-5 pb-3 animate-slide-down">
          {r.status === "failed" && (
            <div className="my-3 flex gap-3 items-start bg-red-950/30 border border-red-900/50 rounded-xl px-4 py-3">
              <span className="text-red-400 text-lg shrink-0">⚠️</span>
              <div>
                <p className="text-sm font-semibold text-red-400">Review failed</p>
                <p className="text-xs text-[#8b949e] mt-0.5 leading-relaxed">The AI agents encountered an error. Check Render logs for details.</p>
              </div>
            </div>
          )}
          {findings.length === 0 && r.status !== "failed" ? (
            <p className="py-6 text-center text-[#484f58] text-sm">
              {r.status === "pending" || r.status === "running" ? "⏳ Review in progress…" : agentFilter === "all" ? "🎉 No issues found" : `No ${agentFilter} findings`}
            </p>
          ) : (
            findings.map(f => <FindingRow key={f.id} f={f} />)
          )}
        </div>
      )}
    </div>
  );
}

/* ── ReviewsPage ─────────────────────────────────────────────── */

export function ReviewsPage() {
  const [page, setPage]                   = useState(1);
  const [agentFilter, setAgentFilter]     = useState("all");
  const [statusFilter, setStatusFilter]   = useState("all");
  const [prStateFilter, setPrStateFilter] = useState<"open" | "merged" | "all">("open");
  const [showSettings, setShowSettings]   = useState(false);
  const { reviews, loading, error, refresh } = useReviews(page);

  const total     = reviews.reduce((s, r) => s + r.findings.length, 0);
  const critical  = reviews.reduce((s, r) => s + r.findings.filter(f => f.severity === "critical").length, 0);
  const high      = reviews.reduce((s, r) => s + r.findings.filter(f => f.severity === "high").length, 0);
  const hasActive = reviews.some(r => r.status === "pending" || r.status === "running");
  const hasFailed = reviews.some(r => r.status === "failed");

  // Old rows without pr_state are treated as "open" (they predate the field)
  const byPrState = prStateFilter === "all"
    ? reviews
    : prStateFilter === "open"
      ? reviews.filter(r => !r.pr_state || r.pr_state === "open")
      : reviews.filter(r => r.pr_state === "merged" || r.pr_state === "closed");

  const filteredReviews = statusFilter === "all"
    ? byPrState
    : byPrState.filter(r => r.status === statusFilter);

  return (
    <div className="min-h-screen bg-[#090c10]">
      {/* Navbar */}
      <header className="sticky top-0 z-10 border-b border-[#21262d] bg-[#0d1117]/90 backdrop-blur-md">
        <div className="max-w-[900px] mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🛡️</span>
            <span className="font-bold text-base text-[#e6edf3] tracking-tight">PatchSense</span>
            <span className="text-[10px] font-bold text-blue-400 bg-blue-950/60 border border-blue-900/50 rounded px-1.5 py-0.5 tracking-widest">BETA</span>
            {hasActive && <span className="text-xs text-yellow-400 animate-pulse-dot ml-1">● reviewing…</span>}
            {hasFailed && (
              <span className="text-xs text-red-400 bg-red-950/40 border border-red-900/40 rounded-full px-2 py-0.5 ml-1">⚠ review failed</span>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={refresh} className="border border-[#30363d] rounded-lg px-3 py-1.5 text-sm text-[#8b949e] hover:text-[#e6edf3] transition-colors">↻</button>
            <button onClick={() => setShowSettings(true)} className="flex items-center gap-1.5 bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-1.5 text-sm text-[#e6edf3] font-medium hover:border-[#8b949e] transition-colors">
              ⚙️ Connect Repo
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[900px] mx-auto px-5 py-7">

        {/* PR state toggle — Open / Merged / All */}
        {!loading && reviews.length > 0 && (
          <div className="flex mb-6 bg-[#0d1117] border border-[#21262d] rounded-xl overflow-hidden w-fit">
            {([
              { key: "open",   label: "Open",    icon: "◉", cls: "text-green-400 bg-green-950/20"   },
              { key: "merged", label: "Merged",  icon: "⇢", cls: "text-purple-400 bg-purple-950/20" },
              { key: "all",    label: "All PRs", icon: "≡", cls: "text-[#8b949e] bg-[#8b949e]/10"   },
            ] as const).map((t, i) => {
              const count = t.key === "all" ? reviews.length : t.key === "open"
                ? reviews.filter(r => !r.pr_state || r.pr_state === "open").length
                : reviews.filter(r => r.pr_state === "merged" || r.pr_state === "closed").length;
              const active = prStateFilter === t.key;
              return (
                <button key={t.key} onClick={() => setPrStateFilter(t.key)}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all ${i < 2 ? "border-r border-[#21262d]" : ""} ${active ? t.cls : "text-[#8b949e] hover:text-[#e6edf3]"}`}
                >
                  <span className="text-xs">{t.icon}</span>
                  {t.label}
                  <span className={`text-[10px] font-bold rounded-full px-1.5 ${active ? "bg-white/10" : "bg-[#21262d] text-[#484f58]"}`}>{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Failed banner */}
        {hasFailed && (
          <div className="mb-5 flex items-center gap-3 bg-red-950/30 border border-red-900/50 rounded-xl px-4 py-3">
            <span className="text-red-400 text-lg">⚠️</span>
            <div>
              <p className="text-sm font-semibold text-red-400">One or more reviews failed</p>
              <p className="text-xs text-[#8b949e] mt-0.5">Check Render deployment logs. Usually an agent API error.</p>
            </div>
          </div>
        )}

        {/* Stats */}
        {!loading && reviews.length > 0 && (
          <div className="grid grid-cols-4 gap-3 mb-7">
            {[
              { icon: "📋", label: "Reviews",  value: reviews.length, cls: "text-[#e6edf3]" },
              { icon: "🔍", label: "Findings", value: total,          cls: "text-blue-400"  },
              { icon: "🚨", label: "Critical",  value: critical,       cls: "text-red-400"   },
              { icon: "⚠️", label: "High",      value: high,           cls: "text-orange-400"},
            ].map(s => (
              <div key={s.label} className="bg-gradient-to-b from-[#161b22] to-[#0d1117] border border-[#21262d] rounded-xl p-4">
                <div className="text-xl mb-2">{s.icon}</div>
                <div className={`text-2xl font-bold leading-none ${s.cls}`}>{s.value}</div>
                <div className="text-xs text-[#8b949e] mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Status filter tabs */}
        {!loading && reviews.length > 0 && (
          <div className="flex gap-2 mb-2.5 flex-wrap">
            {STATUS_FILTERS.map(f => {
              const count = f.key === "all" ? reviews.length : reviews.filter(r => r.status === f.key).length;
              const isActive = statusFilter === f.key;
              return (
                <button key={f.key} onClick={() => setStatusFilter(f.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${isActive ? f.active : "border-[#21262d] text-[#8b949e] hover:border-[#30363d]"}`}
                >
                  {f.label}
                  <span className={`text-[10px] font-bold rounded-full px-1.5 ${isActive ? "bg-white/10" : "bg-[#21262d] text-[#484f58]"}`}>{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Agent filter tabs */}
        {!loading && reviews.length > 0 && (
          <div className="flex gap-2 mb-5 flex-wrap">
            {AGENT_FILTERS.map(f => (
              <button key={f.key} onClick={() => setAgentFilter(f.key)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${agentFilter === f.key ? "border-blue-700 bg-blue-950/50 text-blue-400" : "border-[#21262d] text-[#8b949e] hover:border-[#30363d] hover:text-[#e6edf3]"}`}
              >
                {f.icon} {f.label}
              </button>
            ))}
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center py-24 text-[#484f58]">
            <span className="text-4xl mb-4 animate-pulse-dot">🛡️</span>
            <p className="text-sm">Loading reviews…</p>
          </div>
        )}
        {error && <div className="bg-red-950/30 border border-red-900/50 rounded-xl px-5 py-4 text-red-400 text-sm">⚠️ {error}</div>}
        {!loading && !error && reviews.length === 0 && (
          <div className="flex flex-col items-center py-24 text-[#484f58]">
            <span className="text-5xl mb-4">📭</span>
            <p className="text-base text-[#8b949e] mb-2">No reviews yet</p>
            <p className="text-sm mb-6">Open a PR on a connected repo to trigger a review</p>
            <button onClick={() => setShowSettings(true)} className="border border-[#30363d] bg-[#161b22] rounded-lg px-4 py-2 text-sm text-blue-400 hover:border-blue-800 transition-colors">
              ⚙️ Connect a Repo
            </button>
          </div>
        )}

        {!loading && !error && filteredReviews.length === 0 && reviews.length > 0 && (
          <div className="flex flex-col items-center py-12 text-[#484f58]">
            <span className="text-3xl mb-3">🔍</span>
            <p className="text-sm text-[#8b949e]">No {statusFilter} reviews</p>
          </div>
        )}

        {!loading && !error && filteredReviews.map(r => <ReviewCard key={r.id} r={r} agentFilter={agentFilter} />)}

        {!loading && reviews.length > 0 && (
          <div className="flex justify-center gap-2.5 mt-7">
            {[
              { label: "← Previous", disabled: page === 1,           fn: () => setPage(p => Math.max(1, p - 1)) },
              { label: "Next →",     disabled: reviews.length < 20,  fn: () => setPage(p => p + 1) },
            ].map(b => (
              <button key={b.label} onClick={b.fn} disabled={b.disabled}
                className={`px-5 py-2 rounded-lg text-sm font-medium border transition-colors ${b.disabled ? "border-[#21262d] text-[#484f58] cursor-default" : "border-[#30363d] bg-[#161b22] text-[#e6edf3] hover:border-[#8b949e]"}`}
              >
                {b.label}
              </button>
            ))}
          </div>
        )}
      </main>

      {showSettings && <SettingsDrawer onClose={() => setShowSettings(false)} />}
    </div>
  );
}
