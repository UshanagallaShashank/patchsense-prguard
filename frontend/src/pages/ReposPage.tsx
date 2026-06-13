import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  GitBranch, Trash2, Plus, ExternalLink, Power, PowerOff,
  Loader2, ArrowLeft, CheckCircle2, Clock, Users,
  ChevronDown, ChevronRight, AlertTriangle, UserPlus, UserMinus, Info,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  fetchRepos, toggleRepoActive, disconnectRepo,
  fetchMembers, inviteMember, removeMember,
} from "../services/api"
import type { ConnectedRepo, RepoMember } from "../services/api"
import { ConnectRepoModal } from "../components/ConnectRepoModal"
import { useAuth } from "../context/AuthContext"

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (d < 60) return "just now"
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}

type SortKey = "date" | "name" | "status"

export default function ReposPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const currentLogin = profile?.github_login ?? ""
  const [repos, setRepos]               = useState<ConnectedRepo[]>([])
  const [loading, setLoading]           = useState(true)
  const [toggling, setToggling]         = useState<string | null>(null)
  const [deleting, setDeleting]         = useState<string | null>(null)
  const [connectOpen, setConnectOpen]   = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [sortKey, setSortKey]           = useState<SortKey>("status")

  async function load() {
    setLoading(true)
    try { setRepos(await fetchRepos()) } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleToggle(repo: ConnectedRepo) {
    setToggling(repo.id)
    try {
      await toggleRepoActive(repo.id, !repo.active)
      setRepos(rs => rs.map(r => r.id === repo.id ? { ...r, active: !r.active } : r))
    } finally { setToggling(null) }
  }

  async function handleDisconnect(repo: ConnectedRepo) {
    setDeleting(repo.id)
    setConfirmDelete(null)
    try {
      await disconnectRepo(repo.id)
      setRepos(rs => rs.filter(r => r.id !== repo.id))
    } finally { setDeleting(null) }
  }

  const activeCount  = repos.filter(r => r.active).length
  const ownedCount   = repos.filter(r => r.is_owner).length
  const memberCount  = repos.filter(r => !r.is_owner).length

  function sorted(list: ConnectedRepo[]) {
    return [...list].sort((a, b) => {
      if (sortKey === "name")   return a.full_name.localeCompare(b.full_name)
      if (sortKey === "status") return (b.active ? 1 : 0) - (a.active ? 1 : 0)
      return new Date(b.connected_at).getTime() - new Date(a.connected_at).getTime()
    })
  }

  const ownedRepos  = sorted(repos.filter(r => r.is_owner))
  const memberRepos = sorted(repos.filter(r => !r.is_owner))

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Back + Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate("/")}
            className="h-8 w-8 rounded-lg border border-zinc-800 bg-zinc-900 flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-zinc-100">My Repositories</h1>
            <p className="text-[12px] text-zinc-500">
              {repos.length} connected · {activeCount} active · {ownedCount} owned
              {memberCount > 0 ? ` · ${memberCount} member` : ""}
            </p>
          </div>
          <Button
            onClick={() => setConnectOpen(true)}
            className="gap-1.5 bg-violet-600 hover:bg-violet-500 text-white h-9 text-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            Connect repo
          </Button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="h-6 w-6 text-violet-400 animate-spin" />
            <p className="text-sm text-zinc-500">Loading repos…</p>
          </div>
        ) : repos.length === 0 ? (
          <div className="flex flex-col items-center py-24 gap-4 text-center">
            <div className="h-14 w-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              <GitBranch className="h-6 w-6 text-zinc-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-300">No repos connected yet</p>
              <p className="text-[12px] text-zinc-500 mt-1">
                Connect a GitHub repo to start getting AI reviews on every PR.
              </p>
            </div>
            <Button
              onClick={() => setConnectOpen(true)}
              className="gap-1.5 bg-violet-600 hover:bg-violet-500 text-white mt-1"
            >
              <Plus className="h-3.5 w-3.5" /> Connect your first repo
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {/* Sort bar */}
            {repos.length > 1 && (
              <div className="flex items-center gap-1.5 mb-1 px-1">
                <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mr-1">Sort</span>
                {(["date", "name", "status"] as SortKey[]).map(k => (
                  <button
                    key={k}
                    onClick={() => setSortKey(k)}
                    className={cn(
                      "text-[10px] font-semibold px-2 py-1 rounded border transition-colors capitalize",
                      sortKey === k
                        ? "text-violet-300 border-violet-700/60 bg-violet-950/40"
                        : "text-zinc-600 border-zinc-800 hover:text-zinc-400"
                    )}
                  >
                    {k}
                  </button>
                ))}
              </div>
            )}

            {ownedCount > 0 && memberCount > 0 && (
              <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest px-1 mb-1">Owned</p>
            )}

            {(() => {
              const activeOwned = ownedRepos.filter(r => r.active)
              const pausedOwned = ownedRepos.filter(r => !r.active)
              const showGroups  = sortKey === "status" && activeOwned.length > 0 && pausedOwned.length > 0
              const cardProps   = (repo: ConnectedRepo) => ({
                repo,
                currentLogin,
                toggling: toggling === repo.id,
                deleting: deleting === repo.id,
                confirmingDelete: confirmDelete === repo.id,
                onToggle: () => handleToggle(repo),
                onDeleteRequest: () => setConfirmDelete(repo.id),
                onDeleteConfirm: () => handleDisconnect(repo),
                onDeleteCancel: () => setConfirmDelete(null),
              })
              return (
                <>
                  {showGroups && (
                    <div className="flex items-center gap-2 px-1 mb-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Active</span>
                    </div>
                  )}
                  {activeOwned.map(repo => <RepoCard key={repo.id} {...cardProps(repo)} />)}
                  {showGroups && (
                    <div className="flex items-center gap-2 px-1 mt-4 mb-1">
                      <PowerOff className="h-3 w-3 text-zinc-600" />
                      <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Paused</span>
                    </div>
                  )}
                  {pausedOwned.map(repo => <RepoCard key={repo.id} {...cardProps(repo)} />)}
                </>
              )
            })()}

            {memberCount > 0 && (
              <>
                <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest px-1 mt-3 mb-1">
                  Member of
                </p>
                {memberRepos.map(repo => (
                  <RepoCard
                    key={repo.id}
                    repo={repo}
                    currentLogin={currentLogin}
                    toggling={false}
                    deleting={false}
                    confirmingDelete={false}
                    onToggle={() => {}}
                    onDeleteRequest={() => {}}
                    onDeleteConfirm={() => {}}
                    onDeleteCancel={() => {}}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>

      <ConnectRepoModal
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        onConnected={() => { setConnectOpen(false); load() }}
        skipSetup={repos.length > 0}
      />
    </div>
  )
}

interface RepoCardProps {
  repo: ConnectedRepo
  currentLogin: string
  toggling: boolean
  deleting: boolean
  confirmingDelete: boolean
  onToggle: () => void
  onDeleteRequest: () => void
  onDeleteConfirm: () => void
  onDeleteCancel: () => void
}

function RepoCard({
  repo, currentLogin, toggling, deleting, confirmingDelete,
  onToggle, onDeleteRequest, onDeleteConfirm, onDeleteCancel,
}: RepoCardProps) {
  const [owner, name] = repo.full_name.split("/")
  const [expanded, setExpanded]           = useState(false)
  const [members, setMembers]             = useState<RepoMember[]>([])
  const [membersLoaded, setMembersLoaded] = useState(false)
  const [membersLoading, setMembersLoading] = useState(false)
  const [inviteLogin, setInviteLogin]     = useState("")
  const [inviting, setInviting]           = useState(false)
  const [removing, setRemoving]           = useState<string | null>(null)
  const [inviteError, setInviteError]     = useState("")
  const [inviteSuccess, setInviteSuccess] = useState("")

  async function loadMembers() {
    setMembersLoading(true)
    try {
      setMembers(await fetchMembers(repo.id))
      setMembersLoaded(true)
    } finally { setMembersLoading(false) }
  }

  function toggleExpand() {
    if (!expanded && !membersLoaded) loadMembers()
    setExpanded(e => !e)
  }

  async function handleInvite() {
    if (!inviteLogin.trim()) return
    setInviting(true)
    setInviteError("")
    setInviteSuccess("")
    try {
      const login = inviteLogin.trim()
      await inviteMember(repo.id, login)
      setInviteLogin("")
      setInviteSuccess(`@${login} added. They'll see this repo after signing in to PatchSense with GitHub.`)
      await loadMembers()
    } catch (e: unknown) {
      setInviteError(e instanceof Error ? e.message : "Failed to invite")
    } finally { setInviting(false) }
  }

  async function handleRemove(login: string) {
    setRemoving(login)
    try {
      await removeMember(repo.id, login)
      setMembers(ms => ms.filter(m => m.github_login !== login))
    } finally { setRemoving(null) }
  }

  const noWebhook = repo.webhook_id === null

  return (
    <div className={cn(
      "rounded-xl border transition-all",
      repo.active ? "border-zinc-800 bg-zinc-900/60" : "border-zinc-800/40 bg-zinc-900/20"
    )}>
      {/* Main row */}
      <div className="flex items-center gap-3.5 px-4 py-3.5">
        {/* Icon */}
        <div className={cn(
          "h-9 w-9 rounded-lg border flex items-center justify-center shrink-0",
          repo.active ? "bg-violet-950/50 border-violet-800/40" : "bg-zinc-800/50 border-zinc-700/40"
        )}>
          <GitBranch className={cn("h-4 w-4", repo.active ? "text-violet-400" : "text-zinc-600")} />
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[12px] text-zinc-500">{owner}/</span>
            <span className="text-sm font-semibold text-zinc-100">{name}</span>
            <a
              href={`https://github.com/${repo.full_name}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-zinc-600 hover:text-zinc-300 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
            {noWebhook && (
              <span className="flex items-center gap-1 text-[10px] text-amber-400 border border-amber-700/40 bg-amber-950/30 rounded px-1.5 py-px">
                <AlertTriangle className="h-2.5 w-2.5" /> No webhook
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className={cn(
              "flex items-center gap-1 text-[11px] font-medium",
              repo.active ? "text-emerald-400" : "text-zinc-500"
            )}>
              {repo.active
                ? <><CheckCircle2 className="h-3 w-3" /> Active</>
                : <><PowerOff className="h-3 w-3" /> Paused</>
              }
            </span>
            {!repo.is_owner && (
              <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                <Users className="h-3 w-3" /> Member
              </span>
            )}
            {repo.connected_at && (
              <span className="flex items-center gap-1 text-[11px] text-zinc-600">
                <Clock className="h-3 w-3" /> Connected {timeAgo(repo.connected_at)}
              </span>
            )}
          </div>
        </div>

        {/* Actions — owner only */}
        {repo.is_owner && !confirmingDelete && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={toggleExpand}
              title="Manage members"
              className={cn(
                "h-8 px-2.5 rounded-lg border flex items-center gap-1.5 text-[11px] transition-colors",
                expanded
                  ? "border-violet-700/60 bg-violet-950/40 text-violet-300"
                  : "border-zinc-700 bg-zinc-800 text-zinc-500 hover:text-zinc-300"
              )}
            >
              <Users className="h-3 w-3" />
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>

            <button
              onClick={onToggle}
              disabled={toggling}
              title={repo.active ? "Pause reviews" : "Resume reviews"}
              className={cn(
                "h-8 px-3 rounded-lg border flex items-center gap-1.5 text-[11px] font-medium transition-colors",
                repo.active
                  ? "border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-amber-400 hover:border-amber-800"
                  : "border-zinc-700 bg-zinc-800 text-zinc-500 hover:text-emerald-400 hover:border-emerald-800"
              )}
            >
              {toggling
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : repo.active
                  ? <><PowerOff className="h-3 w-3" /> Pause</>
                  : <><Power className="h-3 w-3" /> Resume</>
              }
            </button>

            <button
              onClick={onDeleteRequest}
              disabled={deleting}
              title="Disconnect"
              className="h-8 w-8 rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-500 hover:text-red-400 hover:border-red-800/60 flex items-center justify-center transition-colors"
            >
              {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            </button>
          </div>
        )}

        {/* Inline delete confirm */}
        {repo.is_owner && confirmingDelete && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-red-400">Remove webhook?</span>
            <button
              onClick={onDeleteConfirm}
              className="h-7 px-2.5 rounded-lg bg-red-900/60 border border-red-700/60 text-red-300 text-[11px] font-medium hover:bg-red-900 transition-colors"
            >
              Yes, disconnect
            </button>
            <button
              onClick={onDeleteCancel}
              className="h-7 px-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 text-[11px] hover:text-zinc-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Members panel */}
      {expanded && repo.is_owner && (
        <div className="border-t border-zinc-800 px-4 py-3.5 space-y-3">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Team Members</p>

          {membersLoading ? (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="h-3.5 w-3.5 text-zinc-500 animate-spin" />
              <span className="text-[12px] text-zinc-600">Loading…</span>
            </div>
          ) : members.length === 0 ? (
            <p className="text-[12px] text-zinc-600 py-1">No members yet — invite someone below.</p>
          ) : (
            <div className="space-y-1.5">
              {members.map(m => {
                const isYou    = m.github_login === currentLogin
                const isOwner  = m.role === "owner"
                const canRemove = !isYou && !isOwner
                return (
                  <div
                    key={m.github_login}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2",
                      isYou
                        ? "bg-violet-950/20 border-violet-800/40"
                        : "bg-zinc-800/40 border-zinc-800"
                    )}
                  >
                    <span className="text-[12px] text-zinc-300 font-mono flex-1">
                      @{m.github_login}
                    </span>
                    {isYou && (
                      <span className="text-[10px] text-violet-400 font-medium">You</span>
                    )}
                    <span className={cn(
                      "text-[10px] capitalize bg-zinc-800 border px-1.5 py-px rounded",
                      isOwner ? "text-emerald-400 border-emerald-800/50" : "text-zinc-600 border-zinc-700"
                    )}>
                      {m.role}
                    </span>
                    <button
                      onClick={() => canRemove && handleRemove(m.github_login)}
                      disabled={removing === m.github_login || !canRemove}
                      className={cn(
                        "ml-1 transition-colors",
                        canRemove
                          ? "text-zinc-600 hover:text-red-400"
                          : "text-zinc-800 cursor-default"
                      )}
                      title={canRemove ? "Remove member" : isOwner ? "Cannot remove owner" : "Cannot remove yourself"}
                    >
                      {removing === m.github_login
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <UserMinus className="h-3 w-3" />
                      }
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Invite input */}
          <div className="flex gap-2 pt-0.5">
            <input
              type="text"
              value={inviteLogin}
              onChange={e => setInviteLogin(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleInvite()}
              placeholder="GitHub username"
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-[12px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-600 transition-colors"
            />
            <button
              onClick={handleInvite}
              disabled={inviting || !inviteLogin.trim()}
              className="h-8 px-3 rounded-lg bg-violet-700/60 border border-violet-600/40 text-violet-200 text-[11px] font-medium hover:bg-violet-700 disabled:opacity-40 flex items-center gap-1.5 transition-colors"
            >
              {inviting ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
              Invite
            </button>
          </div>
          {inviteError && <p className="text-[11px] text-red-400">{inviteError}</p>}
          {inviteSuccess && (
            <p className="text-[11px] text-emerald-400 flex items-start gap-1">
              <CheckCircle2 className="h-3 w-3 mt-px shrink-0" />
              {inviteSuccess}
            </p>
          )}
          <p className="text-[10px] text-zinc-600 flex items-start gap-1">
            <Info className="h-3 w-3 mt-px shrink-0 text-zinc-700" />
            No email is sent. The person needs to sign in to PatchSense with GitHub to access this repo.
          </p>
        </div>
      )}
    </div>
  )
}
