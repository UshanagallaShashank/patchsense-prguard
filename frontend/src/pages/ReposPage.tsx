import { useEffect, useState } from "react"
import { GitBranch, Trash2, Plus, ExternalLink, Power, PowerOff, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { fetchRepos, toggleRepoActive, disconnectRepo } from "../services/api"
import type { ConnectedRepo } from "../services/api"
import { ConnectRepoModal } from "../components/ConnectRepoModal"

export default function ReposPage() {
  const [repos, setRepos]           = useState<ConnectedRepo[]>([])
  const [loading, setLoading]       = useState(true)
  const [toggling, setToggling]     = useState<string | null>(null)
  const [deleting, setDeleting]     = useState<string | null>(null)
  const [connectOpen, setConnectOpen] = useState(false)

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
    if (!confirm(`Disconnect ${repo.full_name}? This removes the webhook from GitHub.`)) return
    setDeleting(repo.id)
    try {
      await disconnectRepo(repo.id)
      setRepos(rs => rs.filter(r => r.id !== repo.id))
    } finally { setDeleting(null) }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-bold text-zinc-100">Repositories</h1>
            <p className="text-sm text-zinc-500 mt-0.5">Manage which repos PatchSense monitors</p>
          </div>
          <Button
            onClick={() => setConnectOpen(true)}
            className="gap-2 bg-violet-600 hover:bg-violet-500 text-white"
          >
            <Plus className="h-4 w-4" />
            Connect repo
          </Button>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 text-violet-400 animate-spin" />
          </div>
        ) : repos.length === 0 ? (
          <div className="flex flex-col items-center py-20 gap-3 text-center">
            <div className="h-12 w-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              <GitBranch className="h-5 w-5 text-zinc-600" />
            </div>
            <p className="text-sm text-zinc-400">No repos connected yet</p>
            <Button onClick={() => setConnectOpen(true)} variant="outline" size="sm" className="border-zinc-700 text-zinc-400 mt-1">
              Connect your first repo
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {repos.map(repo => (
              <div
                key={repo.id}
                className={cn(
                  "rounded-xl border px-5 py-4 flex items-center gap-4 transition-colors",
                  repo.active
                    ? "border-zinc-800 bg-zinc-900/50"
                    : "border-zinc-800/50 bg-zinc-900/20 opacity-60"
                )}
              >
                {/* Icon */}
                <div className={cn(
                  "h-9 w-9 rounded-lg border flex items-center justify-center shrink-0",
                  repo.active ? "bg-violet-950/40 border-violet-800/40" : "bg-zinc-800/40 border-zinc-700/40"
                )}>
                  <GitBranch className={cn("h-4 w-4", repo.active ? "text-violet-400" : "text-zinc-500")} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <a
                      href={`https://github.com/${repo.full_name}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-zinc-100 hover:text-violet-300 transition-colors truncate"
                    >
                      {repo.full_name}
                    </a>
                    <ExternalLink className="h-3 w-3 text-zinc-600 shrink-0" />
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className={cn(
                      "text-[11px] font-medium",
                      repo.active ? "text-emerald-400" : "text-zinc-500"
                    )}>
                      {repo.active ? "Active — reviews on" : "Paused — reviews off"}
                    </span>
                    {repo.connected_at && (
                      <span className="text-[11px] text-zinc-600">
                        Connected {new Date(repo.connected_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {repo.is_owner && (
                    <>
                      <button
                        onClick={() => handleToggle(repo)}
                        disabled={toggling === repo.id}
                        title={repo.active ? "Pause reviews" : "Resume reviews"}
                        className={cn(
                          "h-8 w-8 rounded-lg border flex items-center justify-center transition-colors",
                          repo.active
                            ? "border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-emerald-400 hover:border-emerald-700"
                            : "border-zinc-700 bg-zinc-800 text-zinc-500 hover:text-violet-400 hover:border-violet-700"
                        )}
                      >
                        {toggling === repo.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : repo.active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />
                        }
                      </button>

                      <button
                        onClick={() => handleDisconnect(repo)}
                        disabled={deleting === repo.id}
                        title="Disconnect repo"
                        className="h-8 w-8 rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-500 hover:text-red-400 hover:border-red-800 flex items-center justify-center transition-colors"
                      >
                        {deleting === repo.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />
                        }
                      </button>
                    </>
                  )}
                  {!repo.is_owner && (
                    <span className="text-[11px] text-zinc-600 border border-zinc-800 rounded px-2 py-0.5">Member</span>
                  )}
                </div>
              </div>
            ))}
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
