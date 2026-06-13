import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Users, GitBranch, GitPullRequest, Shield,
  ChevronDown, ChevronRight, Loader2, AlertCircle,
  ArrowLeft, TrendingUp, Activity, ExternalLink,
  CheckCircle2, PowerOff,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { fetchAdminUsers, fetchAdminStats, adminSetPlan } from "../services/api"
import type { AdminUser, AdminStats, AdminRepo } from "../services/api"
import { useAuth } from "../context/AuthContext"

const PLANS: Record<string, { label: string; textColor: string; bgColor: string; borderColor: string; dotColor: string }> = {
  free:  { label: "Free",  textColor: "text-zinc-300",   bgColor: "bg-zinc-800",     borderColor: "border-zinc-700",      dotColor: "bg-zinc-500" },
  pro:   { label: "Pro",   textColor: "text-violet-300",  bgColor: "bg-violet-950/60", borderColor: "border-violet-700/60", dotColor: "bg-violet-500" },
  team:  { label: "Team",  textColor: "text-blue-300",    bgColor: "bg-blue-950/60",   borderColor: "border-blue-700/60",   dotColor: "bg-blue-500" },
}

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (d < 60) return "just now"
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  if (d < 86400 * 30) return `${Math.floor(d / 86400)}d ago`
  if (d < 86400 * 365) return `${Math.floor(d / (86400 * 30))}mo ago`
  return `${Math.floor(d / (86400 * 365))}y ago`
}

interface StatCardProps {
  label: string
  value: number | string
  sub?: string
  icon: React.ElementType
  iconClass?: string
}

function StatCard({ label, value, sub, icon: Icon, iconClass = "text-zinc-500" }: StatCardProps) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-4 flex items-start gap-4">
      <div className="h-9 w-9 rounded-lg border border-zinc-800 bg-zinc-800/60 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className={cn("h-4 w-4", iconClass)} />
      </div>
      <div>
        <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">{label}</p>
        <p className="text-2xl font-bold text-zinc-100 mt-0.5 leading-none">{value}</p>
        {sub && <p className="text-[11px] text-zinc-600 mt-1">{sub}</p>}
      </div>
    </div>
  )
}

interface UserRowProps {
  u: AdminUser
  onPlanChange: (userId: string, plan: string) => void
}

function UserRow({ u, onPlanChange }: UserRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState("")

  const totalPRs = u.repos.reduce((s, r) => s + r.review_count, 0)
  const planMeta = PLANS[u.plan] ?? PLANS.free

  async function setPlan(plan: string) {
    if (plan === u.plan) return
    setSaving(true)
    setSaveErr("")
    try {
      await adminSetPlan(u.id, plan)
      onPlanChange(u.id, plan)
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : "Failed")
    } finally { setSaving(false) }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      {/* Main row */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3.5 px-4 py-3.5 hover:bg-zinc-800/30 transition-colors text-left"
      >
        {/* Avatar */}
        {u.github_avatar_url ? (
          <img src={u.github_avatar_url} alt="" className="h-9 w-9 rounded-full border border-zinc-700 shrink-0" />
        ) : (
          <div className="h-9 w-9 rounded-full bg-zinc-800 border border-zinc-700 shrink-0 flex items-center justify-center">
            <Users className="h-4 w-4 text-zinc-500" />
          </div>
        )}

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-zinc-100 truncate">
              {u.github_login ?? "Unknown user"}
            </span>
            {u.is_admin && (
              <span className="text-[10px] bg-amber-900/40 text-amber-300 border border-amber-700/40 rounded-md px-1.5 py-px font-medium">
                admin
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[11px] text-zinc-600">joined {timeAgo(u.created_at)}</span>
            <span className="text-[11px] text-zinc-500">·</span>
            <span className="text-[11px] text-zinc-500">{u.repo_count} repo{u.repo_count !== 1 ? "s" : ""}</span>
            {totalPRs > 0 && (
              <>
                <span className="text-[11px] text-zinc-500">·</span>
                <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                  <GitPullRequest className="h-2.5 w-2.5" />{totalPRs} PRs
                </span>
              </>
            )}
          </div>
        </div>

        {/* Plan picker */}
        <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 text-zinc-400 animate-spin" />
          ) : (
            <div className="flex gap-1">
              {Object.entries(PLANS).map(([key, meta]) => (
                <button
                  key={key}
                  onClick={() => setPlan(key)}
                  className={cn(
                    "text-[10px] font-semibold px-2.5 py-1 rounded-md border transition-all",
                    u.plan === key
                      ? `${meta.textColor} ${meta.bgColor} ${meta.borderColor}`
                      : "text-zinc-600 border-transparent hover:text-zinc-400 hover:border-zinc-700"
                  )}
                >
                  {meta.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Plan badge */}
        <div className={cn(
          "hidden sm:flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border shrink-0",
          planMeta.textColor, planMeta.bgColor, planMeta.borderColor
        )}>
          <span className={cn("h-1.5 w-1.5 rounded-full", planMeta.dotColor)} />
          {planMeta.label}
        </div>

        {expanded
          ? <ChevronDown className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
          : <ChevronRight className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
        }
      </button>

      {saveErr && (
        <div className="px-4 py-2 bg-red-950/40 border-t border-red-800/40">
          <p className="text-[11px] text-red-400 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{saveErr}</p>
        </div>
      )}

      {/* Expanded repos */}
      {expanded && (
        <div className="border-t border-zinc-800/60 px-4 py-3">
          {u.repos.length === 0 ? (
            <p className="text-[12px] text-zinc-600 py-1">No repos connected</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {u.repos.map(repo => {
                const [owner, name] = repo.full_name.split("/")
                return (
                  <div key={repo.id} className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg border",
                    repo.active ? "border-zinc-800 bg-zinc-900/40" : "border-zinc-800/40 bg-zinc-900/10"
                  )}>
                    <div className={cn(
                      "h-6 w-6 rounded border flex items-center justify-center shrink-0",
                      repo.active ? "border-violet-800/40 bg-violet-950/40" : "border-zinc-800 bg-zinc-800/30"
                    )}>
                      <GitBranch className={cn("h-3 w-3", repo.active ? "text-violet-400" : "text-zinc-600")} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] text-zinc-500">{owner}/</span>
                      <span className="text-[12px] font-semibold text-zinc-200">{name}</span>
                    </div>

                    <a
                      href={`https://github.com/${repo.full_name}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-zinc-600 hover:text-zinc-400 transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>

                    {repo.review_count > 0 && (
                      <div className="flex items-center gap-1 text-[11px] text-zinc-500">
                        <GitPullRequest className="h-3 w-3" />
                        {repo.review_count}
                      </div>
                    )}

                    <span className={cn(
                      "text-[10px] font-medium px-2 py-0.5 rounded-full border",
                      repo.active
                        ? "text-emerald-400 border-emerald-800/50 bg-emerald-950/30"
                        : "text-zinc-500 border-zinc-700 bg-zinc-800/30"
                    )}>
                      {repo.active ? "active" : "paused"}
                    </span>

                    <span className="text-[10px] text-zinc-600">{timeAgo(repo.connected_at)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

type Tab      = "users" | "repos"
type UserSort = "joined" | "repos" | "plan"
type RepoSort = "reviews" | "name" | "status"

interface FlatRepo extends AdminRepo {
  user: AdminUser
}

function SortBar<T extends string>({
  options, value, onChange,
}: {
  options: { key: T; label: string }[]
  value: T
  onChange: (k: T) => void
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mr-1">Sort</span>
      {options.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={cn(
            "text-[10px] font-semibold px-2 py-1 rounded border transition-colors",
            value === key
              ? "text-violet-300 border-violet-700/60 bg-violet-950/40"
              : "text-zinc-600 border-zinc-800 hover:text-zinc-400"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function RepoAdminRow({ repo }: { repo: FlatRepo }) {
  const [owner, name] = repo.full_name.split("/")
  return (
    <div className={cn(
      "rounded-xl border flex items-center gap-3 px-4 py-3",
      repo.active ? "border-zinc-800 bg-zinc-900/40" : "border-zinc-800/40 bg-zinc-900/20"
    )}>
      <div className={cn(
        "h-7 w-7 rounded border flex items-center justify-center shrink-0",
        repo.active ? "border-violet-800/40 bg-violet-950/30" : "border-zinc-800 bg-zinc-800/40"
      )}>
        <GitBranch className={cn("h-3.5 w-3.5", repo.active ? "text-violet-400" : "text-zinc-600")} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] text-zinc-500">{owner}/</span>
          <span className="text-sm font-semibold text-zinc-200">{name}</span>
          <a
            href={`https://github.com/${repo.full_name}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-600 hover:text-zinc-300 transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <p className="text-[11px] text-zinc-600 mt-0.5">Connected {timeAgo(repo.connected_at)}</p>
      </div>

      {/* Owner */}
      <div className="flex items-center gap-1.5 shrink-0">
        {repo.user.github_avatar_url && (
          <img src={repo.user.github_avatar_url} alt="" className="h-5 w-5 rounded-full border border-zinc-700" />
        )}
        <span className="text-[12px] text-zinc-400">{repo.user.github_login}</span>
      </div>

      {/* Review count */}
      <div className="flex items-center gap-1 text-[12px] text-zinc-500 shrink-0 w-20 justify-end">
        <GitPullRequest className="h-3 w-3" />
        {repo.review_count} PRs
      </div>

      {/* Status */}
      <span className={cn(
        "flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0",
        repo.active
          ? "text-emerald-400 border-emerald-800/50 bg-emerald-950/30"
          : "text-zinc-500 border-zinc-700 bg-zinc-800/30"
      )}>
        {repo.active
          ? <><CheckCircle2 className="h-2.5 w-2.5" /> active</>
          : <><PowerOff className="h-2.5 w-2.5" /> paused</>
        }
      </span>
    </div>
  )
}

export default function AdminPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [stats, setStats]     = useState<AdminStats | null>(null)
  const [users, setUsers]     = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState("")
  const [search, setSearch]     = useState("")
  const [tab, setTab]           = useState<Tab>("users")
  const [userSort, setUserSort] = useState<UserSort>("joined")
  const [repoSort, setRepoSort] = useState<RepoSort>("reviews")

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
        <div className="flex flex-col items-center gap-3 text-zinc-500">
          <div className="h-12 w-12 rounded-xl border border-zinc-800 bg-zinc-900 flex items-center justify-center">
            <Shield className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium">Admin access required</p>
        </div>
      </div>
    )
  }

  const sortedUsers = [...users].sort((a, b) => {
    if (userSort === "repos") return b.repo_count - a.repo_count
    if (userSort === "plan") {
      const order: Record<string, number> = { team: 0, pro: 1, free: 2 }
      return (order[a.plan] ?? 3) - (order[b.plan] ?? 3)
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  const filtered = sortedUsers.filter(u =>
    !search || (u.github_login ?? "").toLowerCase().includes(search.toLowerCase())
  )

  const allRepos: FlatRepo[] = users
    .flatMap(u => u.repos.map(r => ({ ...r, user: u })))
    .sort((a, b) => {
      if (repoSort === "name")   return a.full_name.localeCompare(b.full_name)
      if (repoSort === "status") return (b.active ? 1 : 0) - (a.active ? 1 : 0)
      return b.review_count - a.review_count
    })

  const filteredRepos = allRepos.filter(r =>
    !search ||
    r.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (r.user.github_login ?? "").toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate("/")}
            className="h-8 w-8 rounded-lg border border-zinc-800 bg-zinc-900 flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-zinc-100">Admin Dashboard</h1>
            <p className="text-[12px] text-zinc-500">Users, plans, repos, and review activity</p>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="h-6 w-6 text-violet-400 animate-spin" />
            <p className="text-sm text-zinc-500">Loading…</p>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-red-400 text-sm py-10">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        ) : (
          <>
            {/* Stat cards */}
            {stats && (
              <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-4">
                <StatCard
                  label="Users"
                  value={stats.users.total}
                  sub="total accounts"
                  icon={Users}
                  iconClass="text-violet-400"
                />
                <StatCard
                  label="Repos"
                  value={stats.repos.total}
                  sub={`${stats.repos.active} active · ${stats.repos.inactive} paused`}
                  icon={GitBranch}
                  iconClass="text-blue-400"
                />
                <StatCard
                  label="PRs reviewed"
                  value={stats.reviews.total}
                  sub="all time"
                  icon={GitPullRequest}
                  iconClass="text-emerald-400"
                />
                <StatCard
                  label="Est. AI cost"
                  value={`$${(stats.reviews.total * 0.0042).toFixed(2)}`}
                  sub="Gemini 2.5 Flash · ~$0.0042/review"
                  icon={TrendingUp}
                  iconClass="text-amber-400"
                />
              </div>
            )}

            {/* Plan breakdown */}
            {stats && stats.users.total > 0 && (
              <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="h-3.5 w-3.5 text-zinc-500" />
                  <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">Plan distribution</p>
                </div>

                {/* Bar */}
                <div className="flex rounded-full overflow-hidden h-2 bg-zinc-800 gap-px">
                  {Object.entries(PLANS).map(([key, meta]) => {
                    const count = stats.users.by_plan[key] ?? 0
                    const pct = (count / stats.users.total) * 100
                    return pct > 0 ? (
                      <div
                        key={key}
                        className={cn("h-full transition-all", meta.dotColor)}
                        style={{ width: `${pct}%` }}
                      />
                    ) : null
                  })}
                </div>

                {/* Legend */}
                <div className="flex items-center gap-5 mt-3">
                  {Object.entries(PLANS).map(([key, meta]) => {
                    const count = stats.users.by_plan[key] ?? 0
                    const pct = stats.users.total > 0 ? Math.round((count / stats.users.total) * 100) : 0
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full shrink-0", meta.dotColor)} />
                        <span className="text-[12px] text-zinc-400 font-medium">{meta.label}</span>
                        <span className="text-[12px] text-zinc-600">{count} ({pct}%)</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Tabs + controls */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <div className="flex gap-1">
                {([
                  ["users", "Users", filtered.length],
                  ["repos", "Repos", allRepos.length],
                ] as [Tab, string, number][]).map(([key, label, count]) => (
                  <button
                    key={key}
                    onClick={() => { setTab(key); setSearch("") }}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border",
                      tab === key
                        ? "bg-violet-600/20 text-violet-300 border-violet-700/40"
                        : "text-zinc-500 border-transparent hover:text-zinc-300"
                    )}
                  >
                    {label}
                    <span className={cn(
                      "text-[10px] rounded px-1.5 py-px",
                      tab === key ? "bg-violet-900/60 text-violet-300" : "bg-zinc-800 text-zinc-500"
                    )}>
                      {count}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 ml-auto flex-wrap">
                {tab === "users" && (
                  <SortBar<UserSort>
                    options={[
                      { key: "joined", label: "Joined" },
                      { key: "repos",  label: "Repos" },
                      { key: "plan",   label: "Plan" },
                    ]}
                    value={userSort}
                    onChange={setUserSort}
                  />
                )}
                {tab === "repos" && (
                  <SortBar<RepoSort>
                    options={[
                      { key: "reviews", label: "Reviews" },
                      { key: "name",    label: "Name" },
                      { key: "status",  label: "Status" },
                    ]}
                    value={repoSort}
                    onChange={setRepoSort}
                  />
                )}
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={tab === "users" ? "Search GitHub login…" : "Search repos or owner…"}
                  className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-600/60 w-48 transition-colors"
                />
              </div>
            </div>

            {tab === "users" ? (
              <div className="flex flex-col gap-2">
                {filtered.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="text-sm text-zinc-600">
                      {search ? `No users matching "${search}"` : "No users yet"}
                    </p>
                  </div>
                ) : filtered.map(u => (
                  <UserRow key={u.id} u={u} onPlanChange={handlePlanChange} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {filteredRepos.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="text-sm text-zinc-600">
                      {search ? `No repos matching "${search}"` : "No repos connected"}
                    </p>
                  </div>
                ) : filteredRepos.map(r => (
                  <RepoAdminRow key={r.id} repo={r} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
