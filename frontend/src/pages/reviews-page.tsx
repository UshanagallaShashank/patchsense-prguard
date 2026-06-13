import { useState, useEffect } from "react"

import { RefreshCw, Settings, ChevronDown, ChevronUp, Copy, Check, GitMerge, GitBranch, User, AlertTriangle, Shield, Zap, Sparkles, ClipboardList, ScanSearch, Flame, LayoutGrid, Wand2, GitPullRequest, Loader2, LogOut, PlusCircle } from "lucide-react"
import { toast } from "sonner"
import { useReviews } from "../hooks/use-reviews"
import { useAuth } from "../context/AuthContext"
import { SeverityBadge } from "../components/severity-badge"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { generateFix, applyFix, mergePr, fetchConflictDetails, fetchRepos } from "../services/api"
import type { ConflictFile } from "../services/api"
import type { Finding, Review, ReviewStatus } from "../types/review"
import { ConnectRepoModal } from "../components/ConnectRepoModal"

const PLAN_COLOR: Record<string, string> = {
  free: "bg-zinc-800 text-zinc-400",
  pro:  "bg-violet-900/60 text-violet-300",
  team: "bg-blue-900/60 text-blue-300",
}

/* ── config ──────────────────────────────────────────────────── */

const AGENT = {
  security:    { icon: Shield,   label: "Security",    color: "text-red-400",    bg: "bg-red-950/40",    border: "border-red-900/50"    },
  performance: { icon: Zap,      label: "Performance", color: "text-yellow-400", bg: "bg-yellow-950/40", border: "border-yellow-900/50" },
  style:       { icon: Sparkles, label: "Style",       color: "text-purple-400", bg: "bg-purple-950/40", border: "border-purple-900/50" },
} as const

const SEV_COLOR: Record<string, string> = {
  critical: "text-red-400",
  high:     "text-orange-400",
  medium:   "text-yellow-400",
  low:      "text-green-400",
  info:     "text-blue-400",
}

const STATUS: Record<ReviewStatus, { dot: string; text: string; label: string; pulse: boolean }> = {
  completed: { dot: "bg-green-500",  text: "text-green-400",  label: "Reviewed",  pulse: false },
  pending:   { dot: "bg-yellow-500", text: "text-yellow-400", label: "Pending",   pulse: true  },
  running:   { dot: "bg-blue-500",   text: "text-blue-400",   label: "Running",   pulse: true  },
  failed:    { dot: "bg-red-500",    text: "text-red-400",    label: "Failed",    pulse: false },
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)    return "just now"
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

/* ── SettingsDrawer ──────────────────────────────────────────── */

function SettingsDrawer({
  open, onClose, repos, onConnectRepo, onRepoDisconnected,
}: {
  open: boolean
  onClose: () => void
  repos: { id: string; full_name: string }[]
  onConnectRepo: () => void
  onRepoDisconnected: () => void
}) {
  const { profile, user } = useAuth()
  const [disconnecting, setDisconnecting] = useState<string | null>(null)

  async function handleDisconnect(repoId: string) {
    setDisconnecting(repoId)
    try {
      const { disconnectRepo } = await import("../services/api")
      await disconnectRepo(repoId)
      onRepoDisconnected()
      toast.success("Repo disconnected")
    } catch {
      toast.error("Could not disconnect repo")
    } finally {
      setDisconnecting(null)
    }
  }

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
      <SheetContent className="flex flex-col gap-0 overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground" />
            Settings
          </SheetTitle>
          <SheetDescription>Manage your connected repos and account.</SheetDescription>
        </SheetHeader>

        {/* Account */}
        <div className="py-5 border-b border-border">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Account</p>
          <div className="flex items-center gap-3">
            {user?.user_metadata?.avatar_url && (
              <img src={user.user_metadata.avatar_url} alt="" className="h-9 w-9 rounded-full border border-border" />
            )}
            <div>
              <p className="text-sm font-medium text-foreground">@{user?.user_metadata?.user_name}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
            {profile && (
              <span className={`ml-auto text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider ${PLAN_COLOR[profile.plan]}`}>
                {profile.plan}
              </span>
            )}
          </div>
        </div>

        {/* Connected repos */}
        <div className="py-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Connected repos</p>
            <Button size="sm" variant="outline" onClick={onConnectRepo} className="h-7 text-xs gap-1.5">
              <PlusCircle className="h-3 w-3" />
              Add repo
            </Button>
          </div>

          {repos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-8 flex flex-col items-center gap-2 text-center">
              <GitBranch className="h-6 w-6 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No repos connected yet</p>
              <Button size="sm" variant="ghost" onClick={onConnectRepo} className="text-xs text-primary mt-1">
                Connect your first repo →
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {repos.map(r => (
                <div key={r.id} className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
                  <GitBranch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <a
                    href={`https://github.com/${r.full_name}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 text-sm text-foreground hover:text-primary transition-colors truncate font-mono"
                  >
                    {r.full_name}
                  </a>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDisconnect(r.id)}
                    disabled={disconnecting === r.id}
                    className="h-6 text-[11px] px-2 text-red-500/70 hover:text-red-400 hover:bg-red-950/30 shrink-0"
                  >
                    {disconnecting === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Disconnect"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

/* ── ConflictDetail ─────────────────────────────────────────── */

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="shrink-0 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
    >
      {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
    </button>
  )
}

function FileDiffPanel({ file, headBranch, baseBranch }: { file: ConflictFile; headBranch: string; baseBranch: string }) {
  const [tab, setTab] = useState<"diff" | "yours" | "main">("diff")

  const renderDiff = () => {
    if (!file.diff) return <p className="px-3 py-3 text-muted-foreground/50 text-[11px]">No diff available.</p>
    return file.diff.split("\n").map((line, i) => {
      let bg = "", text = "text-muted-foreground/70"
      if (line.startsWith("+++") || line.startsWith("---")) {
        bg = "bg-transparent"; text = "text-muted-foreground/40"
      } else if (line.startsWith("+")) {
        bg = "bg-green-950/60"; text = "text-green-400"
      } else if (line.startsWith("-")) {
        bg = "bg-red-950/60"; text = "text-red-400"
      } else if (line.startsWith("@@")) {
        bg = "bg-blue-950/40"; text = "text-blue-400"
      }
      return (
        <div key={i} className={cn("flex gap-2 px-3 py-[1px] font-mono text-[11px] whitespace-pre-wrap break-all", bg)}>
          <span className={cn("w-3 shrink-0 select-none", text)}>
            {line.startsWith("+") && !line.startsWith("+++") ? "+" : line.startsWith("-") && !line.startsWith("---") ? "−" : " "}
          </span>
          <span className={text}>{line.startsWith("+++") || line.startsWith("---") ? line : line.slice(1) || " "}</span>
        </div>
      )
    })
  }

  const renderFile = (content: string | null, label: string) => {
    if (!content) return <p className="px-3 py-3 text-muted-foreground/50 text-[11px]">Could not fetch {label}.</p>
    return content.split("\n").map((line, i) => (
      <div key={i} className="flex gap-2 px-3 py-[1px] font-mono text-[11px] hover:bg-white/5">
        <span className="text-muted-foreground/30 select-none w-7 text-right shrink-0">{i + 1}</span>
        <span className="text-muted-foreground/80 whitespace-pre-wrap break-all">{line || " "}</span>
      </div>
    ))
  }

  return (
    <div className="mt-2 rounded-lg border border-amber-900/30 overflow-hidden">
      {/* toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-amber-950/30 border-b border-amber-900/30">
        <span className="text-[10px] font-mono text-amber-300/70 truncate max-w-[45%]">{file.filename}</span>
        <div className="flex rounded overflow-hidden border border-amber-900/40 shrink-0 text-[10px]">
          {(["diff", "yours", "main"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn("px-2 py-0.5 transition-colors",
                tab === t ? "bg-amber-900/60 text-amber-300" : "text-muted-foreground hover:text-amber-400"
              )}
            >
              {t === "diff" ? "Diff" : t === "yours" ? `Yours (${headBranch})` : `Main (${baseBranch})`}
            </button>
          ))}
        </div>
      </div>

      {/* legend (diff tab only) */}
      {tab === "diff" && (
        <div className="flex gap-3 px-3 py-1.5 border-b border-border/30 bg-black/20 text-[10px]">
          <span className="text-green-400">+ your branch added</span>
          <span className="text-red-400">− main has (missing from yours)</span>
          <span className="text-blue-400">@@ hunk header</span>
        </div>
      )}

      {/* content */}
      <div className="max-h-72 overflow-y-auto bg-black/30">
        {tab === "diff"  && renderDiff()}
        {tab === "yours" && renderFile(file.head_content, "your branch")}
        {tab === "main"  && renderFile(file.base_content, "main")}
      </div>

      {tab === "diff" && file.diff && (
        <div className="px-3 py-1.5 border-t border-amber-900/20 bg-amber-950/10 text-[10px] text-amber-400/60">
          Red lines exist in main but are missing from your branch. Green lines are what your branch adds. Resolve by keeping both sets of changes.
        </div>
      )}
    </div>
  )
}

function ConflictDetail({ reviewId, headBranch, baseBranch, conflictFiles, repo, prNumber }: {
  reviewId: string; headBranch: string; baseBranch: string; conflictFiles: string[]; repo: string; prNumber: number
}) {
  const [details, setDetails] = useState<ConflictFile[] | null>(null)
  const [loading, setLoading] = useState(false)

  const loadDetails = () => {
    if (details !== null || loading) return
    setLoading(true)
    fetchConflictDetails(reviewId)
      .then(d => setDetails(d.files))
      .catch(() => setDetails([]))
      .finally(() => setLoading(false))
  }

  const steps = [
    { cmd: `git fetch origin`,               label: "1. Fetch latest" },
    { cmd: `git checkout ${headBranch}`,      label: "2. Your branch" },
    { cmd: `git merge origin/${baseBranch}`,  label: "3. Merge base" },
    { cmd: `# Open each file below, resolve the conflict markers, then:`, label: "" },
    { cmd: `git add .`,                       label: "4. Stage" },
    { cmd: `git commit`,                      label: "5. Commit" },
    { cmd: `git push`,                        label: "6. Push" },
  ]

  return (
    <div className="my-3 rounded-xl border border-amber-900/40 bg-amber-950/20 overflow-hidden">
      {/* header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-amber-900/30">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
        <span className="text-xs font-semibold text-amber-400">Merge conflict — cannot be merged until resolved</span>
        <a
          href={`https://github.com/${repo}/pull/${prNumber}`}
          target="_blank" rel="noopener noreferrer"
          className="ml-auto text-[11px] text-amber-400/70 hover:text-amber-400 underline underline-offset-2 shrink-0"
        >
          Resolve on GitHub ↗
        </a>
      </div>

      {/* conflicting files + "what to fix" */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
            What to fix — conflicting files
          </p>
          {details === null && (
            <button
              onClick={loadDetails}
              disabled={loading}
              className="text-[10px] text-amber-400/70 hover:text-amber-400 underline underline-offset-2"
            >
              {loading ? "Loading…" : "Show file contents ↓"}
            </button>
          )}
        </div>

        {/* files listed from DB — or a placeholder until loaded */}
        {conflictFiles.length > 0 && details === null && (
          <div className="flex flex-col gap-1">
            {conflictFiles.map(f => (
              <div key={f} className="text-[11px] font-mono text-amber-300/80 bg-amber-950/30 rounded px-2 py-1 flex items-center gap-2">
                <span className="text-amber-500/60 shrink-0">⚠</span>{f}
              </div>
            ))}
          </div>
        )}
        {conflictFiles.length === 0 && details === null && !loading && (
          <p className="text-[11px] text-muted-foreground/50 italic">Click "Show file contents" to detect conflicting files.</p>
        )}

        {/* per-file diff viewer */}
        {details && details.map(file => (
          <FileDiffPanel key={file.filename} file={file} headBranch={headBranch} baseBranch={baseBranch} />
        ))}

        {/* what Git conflict markers look like */}
        {details && details.length > 0 && (
          <div className="mt-3 rounded-lg border border-border bg-black/20 p-3">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1.5">What the conflict looks like in your editor</p>
            <div className="font-mono text-[11px] space-y-0.5">
              <div className="text-blue-400">{"<<<<<<< HEAD  (your branch)"}</div>
              <div className="text-green-400 ml-2">{"your changes go here"}</div>
              <div className="text-muted-foreground/60">{"======="}</div>
              <div className="text-amber-400 ml-2">{"main's changes go here"}</div>
              <div className="text-red-400">{`>>>>>>> origin/${baseBranch}`}</div>
            </div>
            <p className="text-[10px] text-muted-foreground/60 mt-2">
              Delete the markers and keep whichever lines (or both) make sense for your intent.
            </p>
          </div>
        )}
      </div>

      {/* how to resolve */}
      <div className="px-4 pb-3 border-t border-amber-900/20 pt-3">
        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mb-2">How to resolve locally</p>
        <div className="flex flex-col gap-1">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px] font-mono bg-black/30 rounded px-2 py-1">
              <span className="text-muted-foreground/40 w-20 shrink-0">{s.label}</span>
              <span className={cn("flex-1", s.cmd.startsWith("#") ? "text-muted-foreground/50 italic" : "text-green-400/90")}>
                {s.cmd}
              </span>
              {!s.cmd.startsWith("#") && <CopyButton text={s.cmd} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── DiffViewer ──────────────────────────────────────────────── */

function DiffViewer({ patch }: { patch: string }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden text-[11px] font-mono">
      {patch.split("\n").map((line, i) => {
        const bg = line.startsWith("+") && !line.startsWith("+++")
          ? "bg-green-950/50 text-green-400"
          : line.startsWith("-") && !line.startsWith("---")
          ? "bg-red-950/50 text-red-400"
          : line.startsWith("@@")
          ? "bg-blue-950/40 text-blue-400"
          : "text-muted-foreground"
        return (
          <div key={i} className={cn("px-3 py-0.5 whitespace-pre-wrap break-all", bg)}>
            {line || " "}
          </div>
        )
      })}
    </div>
  )
}

/* ── FindingRow ──────────────────────────────────────────────── */

function FindingRow({ f, reviewId }: { f: Finding; reviewId: string }) {
  const [open, setOpen]           = useState(false)
  const [patch, setPatch]         = useState<string | null>(f.patch ?? null)
  const [generating, setGen]      = useState(false)
  const [applying, setApplying]   = useState<"commit" | "pr" | null>(null)
  const [applyMode, setApplyMode] = useState<"commit" | "pr" | null>(null)
  const [applyConfirm, setApplyConfirm] = useState(false)
  const [fixReviewed, setFixReviewed]   = useState(false)
  const a = AGENT[f.agent as keyof typeof AGENT]
  const Icon = a?.icon

  const handleGenerateFix = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setGen(true)
    try {
      const res = await generateFix(reviewId, f.id)
      setPatch(res.patch)
      setOpen(true)
    } catch (err: any) {
      toast.error("Fix generation failed", { description: err.message })
    } finally {
      setGen(false)
    }
  }

  const handleApply = async (mode: "commit" | "pr") => {
    setApplying(mode)
    try {
      const res = await applyFix(reviewId, f.id, mode)
      if (mode === "pr" && res.pr_url) {
        toast.success("Fix PR created", {
          description: `PR #${res.pr_number} opened`,
          action: { label: "Open", onClick: () => window.open(res.pr_url, "_blank") },
        })
      } else {
        toast.success("Fix committed", { description: `Pushed to ${res.branch}` })
      }
    } catch (err: any) {
      toast.error("Apply failed", { description: err.message })
    } finally {
      setApplying(null)
    }
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="py-3 border-b border-border last:border-0">
        <CollapsibleTrigger asChild>
          <div className={cn("flex gap-3 items-start", (f.suggestion || patch) && "cursor-pointer")}>
            <div className={cn(
              "w-7 h-7 rounded-lg shrink-0 mt-0.5 flex items-center justify-center",
              a?.bg ?? "bg-secondary", "border", a?.border ?? "border-border"
            )}>
              {Icon ? <Icon className={cn("h-3.5 w-3.5", a?.color)} /> : <span className="text-sm">•</span>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                <SeverityBadge severity={f.severity} />
                <code className="text-[11px] text-muted-foreground bg-background border border-border rounded px-1.5 py-0.5 max-w-[220px] truncate font-mono">
                  {f.file_path}{f.line_number != null ? `:${f.line_number}` : ""}
                </code>
                {a && (
                  <Badge className={cn("text-[10px] tracking-widest uppercase px-1.5 py-0.5 rounded", a.bg, a.color, "border", a.border)}>
                    {a.label}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed">{f.message}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 mt-0.5" onClick={e => e.stopPropagation()}>
              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 gap-1" onClick={handleGenerateFix} disabled={generating}>
                {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                {patch ? "Regen" : "Fix"}
              </Button>
            </div>
            {(f.suggestion || patch) && (
              <span className="text-muted-foreground/40 mt-1.5 shrink-0">
                {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </span>
            )}
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 ml-10 space-y-2">
            {f.suggestion && (
              <div className="px-3 py-2.5 bg-green-950/30 border border-green-900/40 rounded-lg text-xs text-green-400 leading-relaxed">
                💡 {f.suggestion}
              </div>
            )}
            {patch && (
              <>
                <DiffViewer patch={patch} />
                <div className="flex gap-2">
                  <Button
                    size="sm" variant="outline"
                    className="h-7 text-xs gap-1.5 border-green-900/50 text-green-400 hover:bg-green-950/40"
                    onClick={() => { setApplyMode("commit"); setApplyConfirm(true); setFixReviewed(false) }}
                    disabled={!!applying}
                  >
                    {applying === "commit" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Commit to branch
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    className="h-7 text-xs gap-1.5 border-blue-900/50 text-blue-400 hover:bg-blue-950/40"
                    onClick={() => { setApplyMode("pr"); setApplyConfirm(true); setFixReviewed(false) }}
                    disabled={!!applying}
                  >
                    {applying === "pr" ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitPullRequest className="h-3 w-3" />}
                    Open fix PR
                  </Button>
                </div>
              </>
            )}
          </div>
        </CollapsibleContent>
      </div>

      {/* Apply-fix confirmation dialog */}
      <Dialog open={applyConfirm} onOpenChange={v => { setApplyConfirm(v); if (!v) setFixReviewed(false) }}>
        <DialogContent onClick={e => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {applyMode === "pr"
                ? <><GitPullRequest className="h-4 w-4 text-blue-400" /> Open fix PR?</>
                : <><Check className="h-4 w-4 text-green-400" /> Commit AI fix?</>}
            </DialogTitle>
            <DialogDescription>
              {applyMode === "pr"
                ? "A new branch and pull request will be created with the AI-generated patch."
                : "The AI-generated patch will be committed directly to the PR branch."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2 items-start bg-amber-950/20 border border-amber-900/30 rounded-xl px-3 py-2.5">
            <AlertTriangle className="text-amber-400 h-4 w-4 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300/80 leading-relaxed">
              <strong className="text-amber-300">AI can make mistakes.</strong> Review the diff above carefully before applying — auto-fixes may introduce new bugs or miss context.
            </p>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs font-mono text-zinc-400 truncate">
            {f.file_path}{f.line_number != null ? `:${f.line_number}` : ""}
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={fixReviewed}
              onChange={e => setFixReviewed(e.target.checked)}
              className="w-4 h-4 rounded accent-violet-600"
            />
            <span className="text-xs text-zinc-300">I have reviewed the patch and it looks correct</span>
          </label>

          <DialogFooter>
            <DialogClose asChild>
              <Button size="sm" variant="outline" className="h-8 text-xs">Cancel</Button>
            </DialogClose>
            <Button
              size="sm"
              disabled={!fixReviewed}
              className={cn(
                "h-8 text-xs gap-1 text-white disabled:opacity-40",
                applyMode === "pr" ? "bg-blue-700 hover:bg-blue-600" : "bg-green-800 hover:bg-green-700"
              )}
              onClick={() => {
                setApplyConfirm(false)
                if (applyMode) handleApply(applyMode)
              }}
            >
              {applyMode === "pr"
                ? <><GitPullRequest className="h-3.5 w-3.5" /> Create fix PR</>
                : <><Check className="h-3.5 w-3.5" /> Commit to branch</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Collapsible>
  )
}

/* ── ReviewCard ──────────────────────────────────────────────── */

function ReviewCard({ r, agentFilter }: { r: Review; agentFilter: string }) {
  const [expanded, setExpanded]       = useState(false)
  const [merging, setMerging]         = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [mergeReviewed, setMergeReviewed] = useState(false)
  const hasConflicts = r.mergeable_state === "dirty"
  const st = STATUS[r.status] ?? STATUS.pending

  const doMerge = () => {
    setConfirmOpen(false)
    setMergeReviewed(false)
    setMerging(true)
    mergePr(r.id)
      .then(() => toast.success("PR merged!"))
      .catch((err: any) => toast.error("Merge failed", { description: err.message }))
      .finally(() => setMerging(false))
  }
  const findings = agentFilter === "all" ? r.findings : r.findings.filter(f => f.agent === agentFilter)

  const sevCounts = ["critical", "high", "medium", "low", "info"].reduce<Record<string, number>>((a, s) => {
    const n = r.findings.filter(f => f.severity === s).length
    if (n) a[s] = n
    return a
  }, {})

  const agentCounts = Object.keys(AGENT).reduce<Record<string, number>>((a, k) => {
    const n = r.findings.filter(f => f.agent === k).length
    if (n) a[k] = n
    return a
  }, {})

  return (
    <Card className={cn("mb-3 overflow-hidden transition-shadow", r.status === "failed" && "border-red-900/60")}>
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger asChild>
          <div className="p-4 cursor-pointer select-none hover:bg-accent/30 transition-colors">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl shrink-0 bg-primary/10 border border-primary/20 flex items-center justify-center">
                <GitMerge className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground leading-snug mb-1">
                  {r.pr_title ?? `PR #${r.pr_number}`}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground truncate">{r.repo_full_name}</span>
                  <Badge variant="secondary" className="text-[10px] rounded-full px-2">PR #{r.pr_number}</Badge>
                  {(!r.pr_state || r.pr_state === "open") && (
                    <Badge className="text-[10px] text-green-400 bg-green-950/40 border-green-900/40 rounded-full">● Open</Badge>
                  )}
                  {r.pr_state === "merged" && (
                    <Badge className="text-[10px] text-purple-400 bg-purple-950/40 border-purple-900/40 rounded-full">⇢ Merged</Badge>
                  )}
                  {r.pr_state === "closed" && (
                    <Badge className="text-[10px] text-red-400 bg-red-950/40 border-red-900/40 rounded-full">✕ Closed</Badge>
                  )}
                  {hasConflicts && (!r.pr_state || r.pr_state === "open") && (
                    <Badge className="text-[10px] text-amber-400 bg-amber-950/40 border-amber-900/40 rounded-full">⚠ Conflicts</Badge>
                  )}
                  {r.head_branch && (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono">
                      <GitBranch className="h-3 w-3 shrink-0" />
                      {r.head_branch}
                    </span>
                  )}
                  {r.author_login && (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <User className="h-3 w-3 shrink-0" />
                      {r.author_login}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <span className={cn("w-2 h-2 rounded-full", st.dot, st.pulse && "animate-pulse-dot")} />
                    <span className={cn("text-[11px] font-semibold", st.text)}>{st.label}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {Object.entries(sevCounts).map(([s, n]) => (
                    <span key={s} className={cn("text-[11px] font-semibold", SEV_COLOR[s] ?? "text-muted-foreground")}>
                      {n} {s}
                    </span>
                  ))}
                  {Object.entries(agentCounts).map(([ag, n]) => {
                    const cfg = AGENT[ag as keyof typeof AGENT]
                    const AgIcon = cfg.icon
                    return (
                      <span key={ag} className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <AgIcon className="h-3 w-3" />
                        {n} {cfg.label.toLowerCase()}
                      </span>
                    )
                  })}
                  {r.findings.length === 0 && r.status === "completed" && (
                    <span className="text-[11px] text-green-400" title="AI agents found no code quality issues in this diff">
                      ✓ No AI findings
                    </span>
                  )}
                  {(r.status === "pending" || r.status === "running") && (
                    <span className={cn("text-[11px] animate-pulse-dot", st.text)}>
                      {r.status === "running" ? "Agents running…" : "Waiting for agents…"}
                    </span>
                  )}
                  <span className="text-[11px] text-muted-foreground/60 ml-auto">{timeAgo(r.created_at)}</span>
                  {(!r.pr_state || r.pr_state === "open") && r.status === "completed" && (
                    hasConflicts ? (
                      <Button
                        size="sm" variant="outline"
                        className="h-6 text-[10px] px-2 gap-1 border-amber-900/50 text-amber-400 shrink-0 opacity-70 cursor-not-allowed"
                        onClick={e => e.stopPropagation()}
                        disabled
                        title="This PR has merge conflicts with the base branch — resolve them on GitHub first"
                      >
                        <AlertTriangle className="h-3 w-3" />
                        Conflicts
                      </Button>
                    ) : (
                      <Button
                        size="sm" variant="outline"
                        className="h-6 text-[10px] px-2 gap-1 border-purple-900/50 text-purple-400 hover:bg-purple-950/40 shrink-0"
                        onClick={e => {
                          e.stopPropagation()
                          setConfirmOpen(true)
                        }}
                        disabled={merging}
                      >
                        {merging ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitMerge className="h-3 w-3" />}
                        Merge
                      </Button>
                    )
                  )}
                </div>
              </div>
              <span className="text-muted-foreground/40 mt-1 shrink-0">
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </span>
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <Separator />
          <div className="px-5 pb-3">
            {hasConflicts && (!r.pr_state || r.pr_state === "open") && (
              <ConflictDetail
                reviewId={r.id}
                headBranch={r.head_branch ?? ""}
                baseBranch={r.base_branch ?? "main"}
                conflictFiles={r.conflict_files ?? []}
                repo={r.repo_full_name}
                prNumber={r.pr_number}
              />
            )}
            {r.status === "failed" && (
              <div className="my-3 flex gap-3 items-start bg-red-950/30 border border-red-900/50 rounded-xl px-4 py-3">
                <AlertTriangle className="text-red-400 h-5 w-5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-red-400">Review failed</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">The AI agents encountered an error. Check Render logs for details.</p>
                </div>
              </div>
            )}
            {findings.length === 0 && r.status !== "failed" ? (
              <p className="py-6 text-center text-muted-foreground text-sm">
                {r.status === "pending" || r.status === "running"
                  ? "⏳ Review in progress…"
                  : agentFilter === "all" ? "🎉 No code issues found by AI" : `No ${agentFilter} findings`}
              </p>
            ) : (
              findings.map(f => <FindingRow key={f.id} f={f} reviewId={r.id} />)
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Dialog open={confirmOpen} onOpenChange={v => { setConfirmOpen(v); if (!v) setMergeReviewed(false) }}>
        <DialogContent onClick={e => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="h-4 w-4 text-purple-400" />
              Merge this PR?
            </DialogTitle>
            <DialogDescription>
              <span className="font-semibold text-foreground">{r.pr_title ?? `PR #${r.pr_number}`}</span>
              {" "}(#{r.pr_number}) on <span className="font-mono">{r.repo_full_name}</span> will be
              squash-merged into the base branch. This cannot be undone from the dashboard.
            </DialogDescription>
          </DialogHeader>

          {/* AI disclaimer */}
          <div className="flex gap-2 items-start bg-amber-950/20 border border-amber-900/30 rounded-xl px-3 py-2.5 mt-1">
            <AlertTriangle className="text-amber-400 h-4 w-4 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300/80 leading-relaxed">
              <strong className="text-amber-300">AI can make mistakes.</strong> Review all findings and the PR diff carefully before merging — PatchSense suggestions are not a substitute for human review.
            </p>
          </div>

          {r.findings.some(f => f.severity === "critical" || f.severity === "high") && (
            <div className="flex gap-2 items-start bg-red-950/30 border border-red-900/50 rounded-xl px-3 py-2">
              <AlertTriangle className="text-red-400 h-4 w-4 shrink-0 mt-0.5" />
              <p className="text-xs text-red-400">
                This PR has unresolved critical/high AI findings. Merge only if you've reviewed and accepted the risk.
              </p>
            </div>
          )}

          {/* Confirmation checkbox */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none mt-1">
            <input
              type="checkbox"
              checked={mergeReviewed}
              onChange={e => setMergeReviewed(e.target.checked)}
              className="w-4 h-4 rounded accent-purple-600"
            />
            <span className="text-xs text-zinc-300">I have reviewed the AI findings and the PR diff</span>
          </label>

          <DialogFooter>
            <DialogClose asChild>
              <Button size="sm" variant="outline" className="h-8 text-xs">Cancel</Button>
            </DialogClose>
            <Button
              size="sm"
              className="h-8 text-xs gap-1 bg-purple-700 hover:bg-purple-600 text-white disabled:opacity-40"
              onClick={doMerge}
              disabled={!mergeReviewed}
            >
              <GitMerge className="h-3.5 w-3.5" />
              Confirm merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

/* ── ReviewsPage ─────────────────────────────────────────────── */

export function ReviewsPage() {
  const [page, setPage]                   = useState(1)
  const [agentFilter, setAgentFilter]     = useState("all")
  const [statusFilter, setStatusFilter]   = useState("all")
  const [prStateFilter, setPrStateFilter] = useState<"open" | "merged" | "all">("open")
  const [showSettings, setShowSettings]   = useState(false)
  const [showUserMenu, setShowUserMenu]   = useState(false)
  const [showConnect, setShowConnect]     = useState(false)
  const [repos, setRepos]                 = useState<{id:string;full_name:string}[]>([])
  const [reposLoaded, setReposLoaded]     = useState(false)
  const [timedOut, setTimedOut]           = useState(false)
  const { reviews, loading, error, refresh } = useReviews(page)
  const { profile, user, signOut } = useAuth()


  const avatarUrl   = user?.user_metadata?.avatar_url as string | undefined
  const githubLogin = user?.user_metadata?.user_name as string | undefined

  function loadRepos() {
    fetchRepos().then(r => { setRepos(r); setReposLoaded(true) }).catch(() => setReposLoaded(true))
  }

  useEffect(() => { loadRepos() }, [])

  // Give SSE 8s to deliver data before showing empty state
  useEffect(() => {
    if (!loading) return
    const t = setTimeout(() => setTimedOut(true), 8000)
    return () => clearTimeout(t)
  }, [loading])

  const total    = reviews.reduce((s, r) => s + r.findings.length, 0)
  const critical = reviews.reduce((s, r) => s + r.findings.filter(f => f.severity === "critical").length, 0)
  const high     = reviews.reduce((s, r) => s + r.findings.filter(f => f.severity === "high").length, 0)
  const hasActive = reviews.some(r => r.status === "pending" || r.status === "running")
  const hasFailed = reviews.some(r => r.status === "failed")

  const byPrState = prStateFilter === "all"
    ? reviews
    : prStateFilter === "open"
      ? reviews.filter(r => !r.pr_state || r.pr_state === "open")
      : reviews.filter(r => r.pr_state === "merged" || r.pr_state === "closed")

  const filteredReviews = statusFilter === "all"
    ? byPrState
    : byPrState.filter(r => r.status === statusFilter)

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="max-w-[900px] mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🛡️</span>
            <span className="font-bold text-base tracking-tight">PatchSense</span>
            <Badge variant="secondary" className="text-[10px] font-bold text-primary tracking-widest">BETA</Badge>
            {hasActive && <span className="text-xs text-yellow-400 animate-pulse-dot ml-1">● reviewing…</span>}
            {hasFailed && (
              <Badge variant="destructive" className="text-xs ml-1">⚠ review failed</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={refresh} className="h-8 w-8">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowSettings(true)} className="gap-1.5">
              <Settings className="h-3.5 w-3.5" />
              Settings
            </Button>

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(v => !v)}
                className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 hover:bg-zinc-900 transition-colors"
              >
                {avatarUrl
                  ? <img src={avatarUrl} alt="" className="h-6 w-6 rounded-full" />
                  : <User className="h-4 w-4 text-zinc-400" />
                }
                {profile && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider ${PLAN_COLOR[profile.plan]}`}>
                    {profile.plan}
                  </span>
                )}
                <ChevronDown className="h-3 w-3 text-zinc-500" />
              </button>

              {showUserMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowUserMenu(false)} />
                  <div className="absolute right-0 top-full mt-1.5 z-20 w-52 rounded-xl border border-border bg-zinc-950 shadow-xl py-1">
                    <div className="px-3 py-2 border-b border-border">
                      <p className="text-xs font-medium text-zinc-200">@{githubLogin}</p>
                      <p className="text-[11px] text-zinc-500">{user?.email}</p>
                    </div>
                    <button
                      onClick={() => { setShowUserMenu(false); setShowConnect(true) }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900 transition-colors"
                    >
                      <PlusCircle className="h-3.5 w-3.5" /> Connect repo
                    </button>
                    <button
                      onClick={() => { setShowUserMenu(false); setShowSettings(true) }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900 transition-colors"
                    >
                      <Settings className="h-3.5 w-3.5" /> Settings
                    </button>
                    <div className="border-t border-border mt-1 pt-1">
                      <button
                        onClick={() => signOut()}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-zinc-900 transition-colors"
                      >
                        <LogOut className="h-3.5 w-3.5" /> Sign out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[900px] mx-auto px-5 py-7">

        {/* PR state toggle */}
        {!loading && reviews.length > 0 && (
          <Tabs value={prStateFilter} onValueChange={v => setPrStateFilter(v as typeof prStateFilter)} className="mb-6">
            <TabsList className="h-9">
              {([
                { key: "open",   label: "Open",    dot: "bg-green-500"  },
                { key: "merged", label: "Merged",  dot: "bg-purple-500" },
                { key: "all",    label: "All PRs", dot: null            },
              ] as const).map(t => {
                const count = t.key === "all" ? reviews.length
                  : t.key === "open" ? reviews.filter(r => !r.pr_state || r.pr_state === "open").length
                  : reviews.filter(r => r.pr_state === "merged" || r.pr_state === "closed").length
                return (
                  <TabsTrigger key={t.key} value={t.key} className="gap-2 text-xs">
                    {t.dot && <span className={cn("w-1.5 h-1.5 rounded-full", t.dot)} />}
                    {t.label}
                    <Badge variant="secondary" className="text-[10px] h-4 min-w-[18px] px-1">{count}</Badge>
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </Tabs>
        )}

        {/* Failed banner */}
        {hasFailed && (
          <Card className="mb-5 border-red-900/50 bg-red-950/20">
            <CardContent className="px-4 py-3 flex items-center gap-3">
              <AlertTriangle className="text-red-400 h-5 w-5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-400">One or more reviews failed</p>
                <p className="text-xs text-muted-foreground mt-0.5">Check Render deployment logs. Usually an agent API error.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        {!loading && reviews.length > 0 && (
          <div className="grid grid-cols-4 gap-3 mb-7">
            {([
              { label: "Reviews",  value: reviews.length, cls: "text-foreground", icon: ClipboardList, iconCls: "text-muted-foreground" },
              { label: "Findings", value: total,          cls: "text-primary",    icon: ScanSearch,    iconCls: "text-primary"          },
              { label: "Critical", value: critical,       cls: "text-red-400",    icon: Flame,         iconCls: "text-red-400"          },
              { label: "High",     value: high,           cls: "text-orange-400", icon: AlertTriangle, iconCls: "text-orange-400"       },
            ] as const).map(s => (
              <Card key={s.label}>
                <CardContent className="p-4">
                  <s.icon className={cn("h-5 w-5 mb-2", s.iconCls)} />
                  <div className={cn("text-2xl font-bold leading-none", s.cls)}>{s.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Status filter */}
        {!loading && reviews.length > 0 && (
          <Tabs value={statusFilter} onValueChange={setStatusFilter} className="mb-2.5">
            <TabsList className="h-8 gap-1 bg-transparent p-0 flex-wrap justify-start">
              {[
                { key: "all",       label: "All"       },
                { key: "pending",   label: "Pending"   },
                { key: "running",   label: "Running"   },
                { key: "completed", label: "Reviewed"  },
                { key: "failed",    label: "Failed"    },
              ].map(f => {
                const count = f.key === "all" ? reviews.length : reviews.filter(r => r.status === f.key).length
                return (
                  <TabsTrigger key={f.key} value={f.key}
                    className="h-7 text-xs rounded-full border border-border data-[state=active]:border-primary/50 data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5"
                  >
                    {f.label}
                    <Badge variant="secondary" className="text-[10px] h-4 min-w-[18px] px-1">{count}</Badge>
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </Tabs>
        )}

        {/* Agent filter */}
        {!loading && reviews.length > 0 && (
          <Tabs value={agentFilter} onValueChange={setAgentFilter} className="mb-5">
            <TabsList className="h-8 gap-1 bg-transparent p-0">
              <TabsTrigger value="all"
                className="h-7 text-xs rounded-full border border-border data-[state=active]:border-primary/50 data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5"
              >
                <LayoutGrid className="h-3 w-3" /> All
              </TabsTrigger>
              {([
                { key: "security",    label: "Security",    icon: Shield   },
                { key: "performance", label: "Performance", icon: Zap      },
                { key: "style",       label: "Style",       icon: Sparkles },
              ] as const).map(f => (
                <TabsTrigger key={f.key} value={f.key}
                  className="h-7 text-xs rounded-full border border-border data-[state=active]:border-primary/50 data-[state=active]:bg-primary/10 data-[state=active]:text-primary gap-1.5"
                >
                  <f.icon className="h-3 w-3" />
                  {f.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {/* Loading skeleton */}
        {loading && !timedOut && (
          <div className="flex flex-col gap-3">
            {[1,2,3].map(i => (
              <div key={i} className="rounded-xl border border-border bg-card p-5 animate-pulse">
                <div className="flex items-center justify-between mb-3">
                  <div className="h-4 w-48 rounded bg-zinc-800" />
                  <div className="h-5 w-16 rounded-full bg-zinc-800" />
                </div>
                <div className="h-3 w-32 rounded bg-zinc-800/60 mb-4" />
                <div className="flex gap-2">
                  <div className="h-6 w-20 rounded bg-zinc-800/40" />
                  <div className="h-6 w-20 rounded bg-zinc-800/40" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No repo connected */}
        {(timedOut || !loading) && !error && reviews.length === 0 && reposLoaded && repos.length === 0 && (
          <div className="flex flex-col items-center py-20 text-center">
            <div className="h-20 w-20 rounded-2xl bg-violet-950/40 border border-violet-800/30 flex items-center justify-center mb-6">
              <GitBranch className="h-9 w-9 text-violet-400" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Connect your first repo</h2>
            <p className="text-zinc-400 text-sm max-w-sm mb-8">
              PatchSense will auto-install a webhook and start reviewing every PR automatically — no CI config needed.
            </p>
            <Button
              onClick={() => setShowConnect(true)}
              className="gap-2 bg-violet-600 hover:bg-violet-500 text-white px-6"
            >
              <PlusCircle className="h-4 w-4" />
              Connect a repo
            </Button>
            <p className="text-zinc-600 text-xs mt-4">You need admin access to the repo</p>
          </div>
        )}

        {/* Has repos but no reviews yet */}
        {(timedOut || !loading) && !error && reviews.length === 0 && reposLoaded && repos.length > 0 && (
          <div className="flex flex-col items-center py-20 text-center">
            <div className="h-20 w-20 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-6">
              <GitPullRequest className="h-9 w-9 text-zinc-500" />
            </div>
            <h2 className="text-xl font-semibold mb-2">No reviews yet</h2>
            <p className="text-zinc-400 text-sm max-w-sm mb-3">
              Open a pull request on one of your connected repos and PatchSense will review it automatically.
            </p>
            <div className="flex flex-wrap gap-2 justify-center mb-6">
              {repos.map(r => (
                <a
                  key={r.id}
                  href={`https://github.com/${r.full_name}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs text-zinc-400 border border-zinc-800 rounded-full px-3 py-1 hover:border-zinc-600 transition-colors"
                >
                  <GitBranch className="h-3 w-3" /> {r.full_name}
                </a>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowConnect(true)} className="gap-2">
              <PlusCircle className="h-3.5 w-3.5" /> Connect another repo
            </Button>
          </div>
        )}

        {error && (
          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="px-5 py-4 text-destructive text-sm">⚠️ {error}</CardContent>
          </Card>
        )}

        {!loading && !error && filteredReviews.length === 0 && reviews.length > 0 && (
          <div className="flex flex-col items-center py-12 text-muted-foreground">
            <span className="text-3xl mb-3">🔍</span>
            <p className="text-sm">No {statusFilter} reviews</p>
          </div>
        )}

        {!loading && !error && filteredReviews.map(r => (
          <ReviewCard key={r.id} r={r} agentFilter={agentFilter} />
        ))}

        {!loading && reviews.length > 0 && (
          <div className="flex justify-center gap-2.5 mt-7">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
              ← Previous
            </Button>
            <Button variant="outline" size="sm" disabled={reviews.length < 20} onClick={() => setPage(p => p + 1)}>
              Next →
            </Button>
          </div>
        )}
      </main>

      <SettingsDrawer
        open={showSettings}
        onClose={() => setShowSettings(false)}
        repos={repos}
        onConnectRepo={() => { setShowSettings(false); setShowConnect(true) }}
        onRepoDisconnected={loadRepos}
      />

      <ConnectRepoModal
        open={showConnect}
        onClose={() => setShowConnect(false)}
        onConnected={() => { loadRepos(); refresh() }}
      />
    </div>
  )
}
