import { useState } from "react";
import { useReviews } from "../hooks/use-reviews";
import { SeverityBadge } from "../components/severity-badge";
import type { Finding, Review, ReviewStatus } from "../types/review";

/* ── constants ─────────────────────────────────────────────── */

const AGENT_CFG = {
  security:    { icon: "🔒", color: "#f85149", label: "Security" },
  performance: { icon: "⚡", color: "#d29922", label: "Performance" },
  style:       { icon: "✦",  color: "#bc8cff", label: "Style" },
} as const;

const STATUS_CFG: Record<ReviewStatus, { dot: string; label: string; pulse: boolean }> = {
  completed: { dot: "#3fb950", label: "Completed", pulse: false },
  pending:   { dot: "#d29922", label: "Pending",   pulse: true  },
  running:   { dot: "#58a6ff", label: "Running",   pulse: true  },
  failed:    { dot: "#f85149", label: "Failed",    pulse: false },
};

const SEV_COLORS: Record<string, string> = {
  critical: "#f85149", high: "#fb8f44", medium: "#d29922", low: "#3fb950", info: "#58a6ff",
};

/* ── helpers ────────────────────────────────────────────────── */

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return "just now";
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/* ── SettingsDrawer ─────────────────────────────────────────── */

function SettingsDrawer({ onClose }: { onClose: () => void }) {
  const webhookUrl = `${window.location.origin.replace("5173", "8000")}/webhook`;
  const deployedUrl = "https://patchsense-prguard-1.onrender.com/webhook";

  const Field = ({ label, value, hint }: { label: string; value: string; hint?: string }) => {
    const [copied, setCopied] = useState(false);
    const copy = () => {
      navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    };
    return (
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "block", fontSize: 12, color: "#8b949e", fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {label}
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <code style={{
            flex: 1, background: "#0d1117", border: "1px solid #30363d",
            borderRadius: 8, padding: "9px 12px", fontSize: 12,
            color: "#58a6ff", fontFamily: "ui-monospace, monospace",
            wordBreak: "break-all", lineHeight: 1.5,
          }}>
            {value}
          </code>
          <button onClick={copy} style={{
            flexShrink: 0, background: copied ? "#14291a" : "#161b22",
            border: `1px solid ${copied ? "#3fb950" : "#30363d"}`,
            borderRadius: 8, padding: "0 14px", color: copied ? "#3fb950" : "#8b949e",
            fontSize: 12, cursor: "pointer", transition: "all 0.15s",
          }}>
            {copied ? "✓" : "Copy"}
          </button>
        </div>
        {hint && <p style={{ fontSize: 11, color: "#484f58", marginTop: 5 }}>{hint}</p>}
      </div>
    );
  };

  const Step = ({ n, text }: { n: number; text: string }) => (
    <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
      <span style={{
        width: 22, height: 22, borderRadius: "50%", background: "#1f3a5f",
        color: "#58a6ff", fontSize: 11, fontWeight: 700,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>{n}</span>
      <span style={{ fontSize: 13, color: "#cdd9e5", lineHeight: 1.5 }}>{text}</span>
    </div>
  );

  return (
    <>
      {/* backdrop */}
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "#00000088", zIndex: 40,
        backdropFilter: "blur(2px)",
      }} />
      {/* drawer */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 420,
        background: "#161b22", borderLeft: "1px solid #30363d",
        zIndex: 50, overflowY: "auto", padding: 24,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#e6edf3" }}>⚙️ Connect a Repo</h2>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: "#8b949e",
            fontSize: 18, cursor: "pointer", padding: "2px 6px",
          }}>✕</button>
        </div>

        <p style={{ fontSize: 13, color: "#8b949e", marginBottom: 24, lineHeight: 1.6 }}>
          Point PatchSense at any GitHub repo — just set the webhook URL and secret. Works with any repo you own or have admin access to.
        </p>

        {/* Steps */}
        <div style={{
          background: "#0d1117", border: "1px solid #21262d",
          borderRadius: 10, padding: "16px 16px 8px", marginBottom: 24,
        }}>
          <p style={{ fontSize: 11, color: "#8b949e", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
            How to connect
          </p>
          <Step n={1} text="Go to the GitHub repo → Settings → Webhooks → Add webhook" />
          <Step n={2} text='Set Payload URL to the webhook URL below, Content type: application/json' />
          <Step n={3} text='Set Secret to: patchsense123' />
          <Step n={4} text='Under events, select "Let me select individual events" → tick Pull requests only' />
          <Step n={5} text="Click Add webhook — done. Any new PR will trigger an AI review." />
        </div>

        {/* URLs */}
        <Field
          label="Webhook URL (deployed)"
          value={deployedUrl}
          hint="Use this if the backend is deployed on Render"
        />
        <Field
          label="Webhook URL (local)"
          value={webhookUrl}
          hint="Use this for local dev with ngrok or VS Code port forwarding"
        />
        <Field
          label="Webhook Secret"
          value="patchsense123"
          hint="Paste this into the GitHub webhook secret field"
        />

        {/* tip */}
        <div style={{
          background: "#0d1a2d", border: "1px solid #1f3d6e",
          borderRadius: 10, padding: "12px 14px", marginTop: 8,
        }}>
          <p style={{ fontSize: 12, color: "#58a6ff", lineHeight: 1.6 }}>
            💡 <strong>Multi-repo:</strong> add the same webhook to as many repos as you want. PatchSense tracks <code style={{ background: "#0d1117", padding: "0 4px", borderRadius: 3 }}>repo_full_name</code> per review — they all show up here.
          </p>
        </div>
      </div>
    </>
  );
}

/* ── FindingRow ─────────────────────────────────────────────── */

function FindingRow({ f }: { f: Finding }) {
  const [open, setOpen] = useState(false);
  const agent = AGENT_CFG[f.agent as keyof typeof AGENT_CFG];

  return (
    <div onClick={() => f.suggestion && setOpen(o => !o)} style={{
      padding: "12px 0", borderBottom: "1px solid #1c2128",
      cursor: f.suggestion ? "pointer" : "default",
    }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0, marginTop: 1,
          background: `${agent?.color ?? "#8b949e"}18`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13,
        }}>
          {agent?.icon ?? "•"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 5 }}>
            <SeverityBadge severity={f.severity} />
            <span style={{
              fontSize: 11, color: "#8b949e", fontFamily: "ui-monospace, monospace",
              background: "#161b22", border: "1px solid #21262d",
              borderRadius: 4, padding: "1px 6px",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240,
            }}>
              {f.file_path}{f.line_number != null ? `:${f.line_number}` : ""}
            </span>
            <span style={{
              fontSize: 10, color: agent?.color ?? "#8b949e",
              background: `${agent?.color ?? "#8b949e"}15`,
              border: `1px solid ${agent?.color ?? "#8b949e"}30`,
              borderRadius: 4, padding: "1px 6px",
              textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.06em",
            }}>
              {agent?.label ?? f.agent}
            </span>
          </div>
          <p style={{ fontSize: 13, color: "#cdd9e5", lineHeight: 1.55 }}>{f.message}</p>
          {open && f.suggestion && (
            <div className="findings-list" style={{
              marginTop: 8, padding: "10px 12px",
              background: "linear-gradient(135deg, #0d2218, #0d1a2d)",
              border: "1px solid #1f3a28", borderRadius: 8,
              fontSize: 12, color: "#3fb950", lineHeight: 1.55,
            }}>
              💡 {f.suggestion}
            </div>
          )}
        </div>
        {f.suggestion && (
          <span style={{ color: "#484f58", fontSize: 11, marginTop: 6, flexShrink: 0 }}>
            {open ? "▲" : "▼"}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── ReviewCard ─────────────────────────────────────────────── */

function ReviewCard({ r, agentFilter }: { r: Review; agentFilter: string }) {
  const [expanded, setExpanded] = useState(false);
  const st = STATUS_CFG[r.status] ?? STATUS_CFG.pending;

  const findings = agentFilter === "all"
    ? r.findings
    : r.findings.filter(f => f.agent === agentFilter);

  const bySev = ["critical", "high", "medium", "low", "info"].reduce<Record<string, number>>((acc, s) => {
    const n = r.findings.filter(f => f.severity === s).length;
    if (n) acc[s] = n;
    return acc;
  }, {});

  const byAgent = Object.entries(AGENT_CFG).reduce<Record<string, number>>((acc, [k]) => {
    const n = r.findings.filter(f => f.agent === k).length;
    if (n) acc[k] = n;
    return acc;
  }, {});

  return (
    <div style={{
      background: "linear-gradient(180deg, #161b22 0%, #0d1117 100%)",
      border: "1px solid #21262d",
      borderRadius: 14, marginBottom: 12, overflow: "hidden",
      boxShadow: expanded ? "0 4px 28px #00000055" : "none",
      transition: "box-shadow 0.2s",
    }}>
      <div onClick={() => setExpanded(e => !e)} style={{
        padding: "16px 20px", cursor: "pointer", userSelect: "none",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: "linear-gradient(135deg, #1f3a5f, #1a2d4a)",
            border: "1px solid #2d4a6e",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
          }}>🔀</div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#e6edf3" }}>
                {r.repo_full_name}
              </span>
              <span style={{
                fontSize: 12, color: "#8b949e", background: "#21262d",
                borderRadius: 20, padding: "1px 9px",
              }}>
                PR #{r.pr_number}
              </span>
              {/* live status */}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: st.dot, boxShadow: `0 0 6px ${st.dot}`,
                  display: "inline-block",
                  animation: st.pulse ? "pulse 1.4s ease-in-out infinite" : "none",
                }} />
                <span style={{ fontSize: 11, color: st.dot, fontWeight: 600 }}>{st.label}</span>
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7, flexWrap: "wrap" }}>
              {/* severity chips */}
              {Object.entries(bySev).map(([s, n]) => (
                <span key={s} style={{
                  fontSize: 11, color: SEV_COLORS[s],
                  background: `${SEV_COLORS[s]}15`,
                  border: `1px solid ${SEV_COLORS[s]}30`,
                  borderRadius: 20, padding: "1px 8px",
                }}>
                  {n} {s}
                </span>
              ))}
              {/* agent chips */}
              {Object.entries(byAgent).map(([a, n]) => {
                const cfg = AGENT_CFG[a as keyof typeof AGENT_CFG];
                return (
                  <span key={a} style={{ fontSize: 11, color: "#8b949e" }}>
                    {cfg.icon} {n} {cfg.label.toLowerCase()}
                  </span>
                );
              })}
              {r.findings.length === 0 && r.status === "completed" && (
                <span style={{ fontSize: 11, color: "#3fb950" }}>✓ Clean PR</span>
              )}
              {r.status === "pending" && (
                <span style={{ fontSize: 11, color: "#d29922", animation: "pulse 1.4s ease-in-out infinite" }}>
                  Waiting for agents…
                </span>
              )}
              {r.status === "running" && (
                <span style={{ fontSize: 11, color: "#58a6ff", animation: "pulse 1.4s ease-in-out infinite" }}>
                  Agents running…
                </span>
              )}
              <span style={{ fontSize: 11, color: "#484f58", marginLeft: "auto" }}>
                {timeAgo(r.created_at)}
              </span>
            </div>
          </div>

          <span style={{ color: "#484f58", fontSize: 11, marginTop: 4, flexShrink: 0 }}>
            {expanded ? "▲" : "▼"}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="findings-list" style={{ borderTop: "1px solid #1c2128", padding: "4px 20px 12px" }}>
          {findings.length === 0 ? (
            <p style={{ padding: "24px 0", textAlign: "center", color: "#484f58", fontSize: 13 }}>
              {r.status === "pending" || r.status === "running"
                ? "⏳ Review in progress…"
                : agentFilter === "all" ? "🎉 No issues found" : `No ${agentFilter} findings`}
            </p>
          ) : (
            findings.map(f => <FindingRow key={f.id} f={f} />)
          )}
        </div>
      )}
    </div>
  );
}

/* ── ReviewsPage ────────────────────────────────────────────── */

export function ReviewsPage() {
  const [page, setPage] = useState(1);
  const [agentFilter, setAgentFilter] = useState("all");
  const [showSettings, setShowSettings] = useState(false);
  const { reviews, loading, error, refresh } = useReviews(page);

  const total    = reviews.reduce((s, r) => s + r.findings.length, 0);
  const critical = reviews.reduce((s, r) => s + r.findings.filter(f => f.severity === "critical").length, 0);
  const high     = reviews.reduce((s, r) => s + r.findings.filter(f => f.severity === "high").length, 0);
  const hasActive = reviews.some(r => r.status === "pending" || r.status === "running");

  const FILTERS = [
    { key: "all",         label: "All",         icon: "◈" },
    { key: "security",    label: "Security",    icon: "🔒" },
    { key: "performance", label: "Performance", icon: "⚡" },
    { key: "style",       label: "Style",       icon: "✦" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#090c10" }}>
      {/* Navbar */}
      <header style={{
        borderBottom: "1px solid #21262d",
        background: "#0d1117ee", backdropFilter: "blur(12px)",
        position: "sticky", top: 0, zIndex: 10, padding: "0 24px",
      }}>
        <div style={{
          maxWidth: 900, margin: "0 auto", height: 56,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>🛡️</span>
            <span style={{ fontWeight: 700, fontSize: 16, color: "#e6edf3" }}>PatchSense</span>
            <span style={{
              fontSize: 10, fontWeight: 700, color: "#58a6ff",
              background: "#0d1a2d", border: "1px solid #1f3d6e",
              borderRadius: 4, padding: "2px 6px", letterSpacing: "0.06em",
            }}>BETA</span>
            {hasActive && (
              <span style={{
                fontSize: 11, color: "#d29922",
                animation: "pulse 1.4s ease-in-out infinite",
              }}>
                ● reviewing…
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={refresh} title="Refresh" style={{
              background: "none", border: "1px solid #30363d", borderRadius: 8,
              color: "#8b949e", padding: "5px 12px", fontSize: 13, cursor: "pointer",
            }}>↻</button>
            <button onClick={() => setShowSettings(true)} style={{
              background: "#161b22", border: "1px solid #30363d", borderRadius: 8,
              color: "#e6edf3", padding: "5px 14px", fontSize: 13,
              fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
            }}>
              ⚙️ Connect Repo
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px" }}>
        {/* Stats */}
        {!loading && reviews.length > 0 && (
          <div style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
            {[
              { icon: "📋", label: "Reviews",  value: reviews.length, color: undefined },
              { icon: "🔍", label: "Findings", value: total,          color: "#58a6ff" },
              { icon: "🚨", label: "Critical",  value: critical,       color: "#f85149" },
              { icon: "⚠️", label: "High",      value: high,           color: "#fb8f44" },
            ].map(s => (
              <div key={s.label} style={{
                background: "linear-gradient(135deg, #161b22, #0d1117)",
                border: "1px solid #21262d", borderRadius: 12,
                padding: "16px 20px", flex: 1, minWidth: 100,
              }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{s.icon}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: s.color ?? "#e6edf3", lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 12, color: "#8b949e", marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filter tabs */}
        {!loading && reviews.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
            {FILTERS.map(f => (
              <button key={f.key} onClick={() => setAgentFilter(f.key)} style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "6px 14px", borderRadius: 20,
                border: agentFilter === f.key ? "1px solid #58a6ff" : "1px solid #21262d",
                background: agentFilter === f.key ? "#0d1a2d" : "transparent",
                color: agentFilter === f.key ? "#58a6ff" : "#8b949e",
                fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
              }}>
                {f.icon} {f.label}
              </button>
            ))}
          </div>
        )}

        {/* States */}
        {loading && (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#484f58" }}>
            <div style={{ fontSize: 32, marginBottom: 12, animation: "pulse 1.4s ease-in-out infinite" }}>🛡️</div>
            <p style={{ fontSize: 14 }}>Loading reviews…</p>
          </div>
        )}
        {error && (
          <div style={{
            background: "#1c0e0e", border: "1px solid #5a1d1d",
            borderRadius: 12, padding: "16px 20px", color: "#f85149", fontSize: 13,
          }}>
            ⚠️ {error}
          </div>
        )}
        {!loading && !error && reviews.length === 0 && (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#484f58" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
            <p style={{ fontSize: 15, color: "#8b949e", marginBottom: 8 }}>No reviews yet</p>
            <p style={{ fontSize: 13, marginBottom: 20 }}>Open a PR to trigger an AI review</p>
            <button onClick={() => setShowSettings(true)} style={{
              background: "#161b22", border: "1px solid #30363d", borderRadius: 8,
              color: "#58a6ff", padding: "8px 20px", fontSize: 13, cursor: "pointer",
            }}>
              ⚙️ Connect a Repo
            </button>
          </div>
        )}

        {!loading && !error && reviews.map(r => (
          <ReviewCard key={r.id} r={r} agentFilter={agentFilter} />
        ))}

        {/* Pagination */}
        {!loading && reviews.length > 0 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 28 }}>
            {[
              { label: "← Previous", disabled: page === 1,          fn: () => setPage(p => Math.max(1, p - 1)) },
              { label: "Next →",     disabled: reviews.length < 20, fn: () => setPage(p => p + 1) },
            ].map(b => (
              <button key={b.label} onClick={b.fn} disabled={b.disabled} style={{
                padding: "8px 20px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                border: "1px solid #30363d",
                background: b.disabled ? "transparent" : "#161b22",
                color: b.disabled ? "#484f58" : "#e6edf3",
                cursor: b.disabled ? "default" : "pointer",
              }}>
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
