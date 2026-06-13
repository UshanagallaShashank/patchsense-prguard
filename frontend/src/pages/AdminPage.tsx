import { useEffect, useState } from "react"
import {
  Users, GitBranch, GitPullRequest, Crown, Shield, ChevronDown, ChevronRight,
  Loader2, AlertCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { fetchAdminUsers, fetchAdminStats, adminSetPlan } from "../services/api"
import type { AdminUser, AdminStats } from "../services/api"
import { useAuth } from "../context/AuthContext"

const PLAN_LABELS: Record<string, { label: string; color: string; icon: typeof Shield }> = {
  free:  { label: "Free",  color: "text-zinc-400",   icon: Shield },
  pro:   { label: "Pro",   color: "text-violet-400",  icon: Crown },
  team:  { label: "Team",  color: "text-blue-400",    icon: Users },
}

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-4">
      <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">{label}</p>
      <p className="text-2xl font-bold text-zinc-100 mt-1">{value}</p>
      {sub && <p className="text-[11px] text-zinc-600 mt-0.5">{sub}</p>}
    </div>
  )
}

function UserRow({ u, onPlanChange }: { u: AdminUser; onPlanChange: (userId: string, plan: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)

  const PlanIcon = PLAN_LABELS[u.plan]?.icon ?? Shield

  async function setPlan(plan: string) {
    setSaving(true)
    try {
      await adminSetPlan(u.id, plan)
      onPlanChange(u.id, plan)
    } finally { setSaving(false) }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      {/* User row */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/40 transition-colors text-left"
      >
        {u.github_avatar_url ? (
          <img src={u.github_avatar_url} alt="" className="h-8 w-8 rounded-full border border-zinc-700 shrink-0" />
        ) : (
          <div className="h-8 w-8 rounded-full bg-zinc-800 border border-zinc-700 shrink-0 flex items-center justify-center">
            <Users className="h-4 w-4 text-zinc-500" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-zinc-100 truncate">
              {u.github_login ?? u.id.slice(0, 8)}
            </span>
            {u.is_admin && (
              <span className="text-[10px] bg-amber-900/40 text-amber-300 border border-amber-700/40 rounded px-1.5 py-px">admin</span>
            )}
          </div>
          <p className="text-[11px] text-zinc-500">{u.repo_count} repo{u.repo_count !== 1 ? "s" : ""}</p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Plan picker */}
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 text-zinc-400 animate-spin" />
            ) : (
              <div className="flex gap-1">
                {Object.entries(PLAN_LABELS).map(([key, { label, color }]) => (
                  <button
                    key={key}
                    onClick={() => setPlan(key)}
                    className={cn(
                      "text-[10px] font-semibold px-2 py-0.5 rounded border transition-colors",
                      u.plan === key
                        ? `${color} border-current bg-zinc-800`
                        : "text-zinc-600 border-zinc-800 hover:text-zinc-400"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <PlanIcon className={cn("h-4 w-4 shrink-0", PLAN_LABELS[u.plan]?.color ?? "text-zinc-500")} />
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-zinc-600" />
            : <ChevronRight className="h-3.5 w-3.5 text-zinc-600" />
          }
        </div>
      </button>

      {/* Repos */}
      {expanded && (
        <div className="border-t border-zinc-800 px-4 py-3 space-y-2">
          {u.repos.length === 0 ? (
            <p className="text-[12px] text-zinc-600">No repos connected</p>
          ) : (
            u.repos.map(repo => (
              <div key={repo.id} className="flex items-center gap-3 py-1.5">
                <div className={cn(
                  "h-6 w-6 rounded border flex items-center justify-center shrink-0",
                  repo.active ? "border-violet-800/40 bg-violet-950/30" : "border-zinc-800 bg-zinc-800/40"
                )}>
                  <GitBranch className={cn("h-3 w-3", repo.active ? "text-violet-400" : "text-zinc-600")} />
                </div>
                <span className="text-[12px] text-zinc-300 flex-1 font-mono">{repo.full_name}</span>
                <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                  <GitPullRequest className="h-3 w-3" />
                  {repo.review_count} PRs reviewed
                </div>
                <span className={cn(
                  "text-[10px] font-medium px-1.5 py-px rounded border",
                  repo.active
                    ? "text-emerald-400 border-emerald-800/40 bg-emerald-950/20"
                    : "text-zinc-500 border-zinc-700 bg-zinc-800/40"
                )}>
                  {repo.active ? "active" : "paused"}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function AdminPage() {
  const { profile } = useAuth()
  const [stats, setStats]   = useState<AdminStats | null>(null)
  const [users, setUsers]   = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState("")
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (!profile?.is_admin) return
    Promise.all([fetchAdminStats(), fetchAdminUsers()])
      .then(([s, u]) => { setStats(s); setUsers(u) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [profile])

  function handlePlanChange(userId: string, plan: string) {
    setUsers(us => us.map(u => u.id === userId ? { ...u, plan } : u))
  }

  if (!profile?.is_admin) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex items-center gap-2 text-zinc-500">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">Admin access required</span>
        </div>
      </div>
    )
  }

  const filtered = users.filter(u =>
    !search || (u.github_login ?? "").toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-zinc-100">Admin Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Users, plans, and repo activity</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 text-violet-400 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-red-400 text-sm py-10">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        ) : (
          <>
            {/* Stats */}
            {stats && (
              <div className="grid grid-cols-2 gap-3 mb-8 sm:grid-cols-4">
                <StatCard label="Total users" value={stats.users.total} />
                <StatCard
                  label="By plan"
                  value={`${stats.users.by_plan.free ?? 0}F · ${stats.users.by_plan.pro ?? 0}P · ${stats.users.by_plan.team ?? 0}T`}
                  sub="free · pro · team"
                />
                <StatCard
                  label="Repos"
                  value={stats.repos.total}
                  sub={`${stats.repos.active} active · ${stats.repos.inactive} paused`}
                />
                <StatCard label="PRs reviewed" value={stats.reviews.total} />
              </div>
            )}

            {/* Plan breakdown bar */}
            {stats && stats.users.total > 0 && (
              <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-4">
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-3">Plan distribution</p>
                <div className="flex rounded-full overflow-hidden h-2 gap-px">
                  {Object.entries(stats.users.by_plan).map(([plan, count]) => {
                    const pct = (count / stats.users.total) * 100
                    const colors: Record<string, string> = { free: "bg-zinc-600", pro: "bg-violet-500", team: "bg-blue-500" }
                    return pct > 0 ? (
                      <div key={plan} className={cn("h-full", colors[plan] ?? "bg-zinc-700")} style={{ width: `${pct}%` }} />
                    ) : null
                  })}
                </div>
                <div className="flex gap-4 mt-2">
                  {Object.entries(stats.users.by_plan).map(([plan, count]) => (
                    <div key={plan} className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                      <span className={cn("h-2 w-2 rounded-full", { free: "bg-zinc-600", pro: "bg-violet-500", team: "bg-blue-500" }[plan] ?? "bg-zinc-600")} />
                      {PLAN_LABELS[plan]?.label ?? plan}: {count}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Users */}
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-zinc-300">Users ({filtered.length})</p>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by GitHub login…"
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-600 w-52"
              />
            </div>

            <div className="flex flex-col gap-2">
              {filtered.map(u => (
                <UserRow key={u.id} u={u} onPlanChange={handlePlanChange} />
              ))}
              {filtered.length === 0 && (
                <p className="text-sm text-zinc-600 py-6 text-center">No users found</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
