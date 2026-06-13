import { useState } from "react"
import { RefreshCw, Settings, ChevronDown, ChevronUp, Copy, Check, GitMerge, GitBranch, User, AlertTriangle, Shield, Zap, Sparkles, ClipboardList, ScanSearch, Flame, LayoutGrid, Wand2, GitPullRequest, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useReviews } from "../hooks/use-reviews"
import { SeverityBadge } from "../components/severity-badge"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { generateFix, applyFix, mergePr, fetchConflictDetails } from "../services/api"
import type { ConflictFile } from "../services/api"
import type { Finding, Review, ReviewStatus } from "../types/review"

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

function CopyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="mb-5">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">{label}</p>
      <div className="flex gap-2">
        <code className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-xs text-primary font-mono break-all leading-relaxed">
          {value}
        </code>
        <Button
          size="sm"
          variant="outline"
          onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
          className={cn("shrink-0", copied && "border-green-700 text-green-400")}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
      {hint && <p className="text-xs text-muted-foreground/60 mt-1.5">{hint}</p>}
    </div>
  )
}

function SettingsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const steps = [
    "Go to GitHub repo → Settings → Webhooks → Add webhook",
    "Set Payload URL to the deployed webhook URL below",
    "Set Content type to application/json",
    "Set Secret to: patchsense123",
    'Under events → "Let me select individual events" → tick Pull requests only',
    "Click Add webhook — every new PR auto-triggers a review",
  ]
  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>⚙️ Connect a Repo</SheetTitle>
          <SheetDescription>
            Add the webhook to any repo — PatchSense reviews every PR automatically.
          </SheetDescription>
        </SheetHeader>

        <Card className="mb-6">
          <CardHeader className="pb-3 pt-4 px-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Setup steps</p>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ol className="space-y-3">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-3 items-start">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 border border-primary/30 text-primary text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                  <span className="text-sm text-foreground/80 leading-relaxed">{s}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <CopyField label="Webhook URL (deployed)" value="https://patchsense-prguard-t9ze.onrender.com/webhook" hint="Use for production" />
        <CopyField label="Webhook Secret" value="patchsense123" hint="Paste into the GitHub webhook secret field" />

        <Card className="border-primary/20 bg-primary/5 mt-2">
          <CardContent className="px-4 py-4">
            <p className="text-xs text-primary/80 leading-relaxed">
              💡 <strong>Multi-repo:</strong> add the same webhook to as many repos as you want. Each review is tagged by{" "}
              <code className="bg-background px-1 rounded text-primary">repo_full_name</code> and shows up here.
            </p>
          </CardContent>
        </Card>
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
  const [tab, setTab] = useState<"yours" | "main">("yours")
  const content = tab === "yours" ? file.head_content : file.base_content
  const lines = content?.split("\n") ?? []

  return (
    <div className="mt-2 rounded-lg border border-amber-900/30 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-amber-950/30 border-b border-amber-900/30">
        <span className="text-[10px] font-mono text-amber-300/70 truncate max-w-[60%]">{file.filename}</span>
        <div className="flex rounded overflow-hidden border border-amber-900/40 shrink-0">
          {(["yours", "main"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "text-[10px] px-2 py-0.5 transition-colors",
                tab === t ? "bg-amber-900/60 text-amber-300" : "text-muted-foreground hover:text-amber-400"
              )}
            >
              {t === "yours" ? `Your branch (${headBranch})` : `main (${baseBranch})`}
            </button>
          ))}
        </div>
      </div>
      <div className="max-h-48 overflow-y-auto bg-black/30 font-mono text-[11px]">
        {lines.map((line, i) => (
          <div key={i} className="flex gap-2 px-3 py-[1px] hover:bg-white/5">
            <span className="text-muted-foreground/30 select-none w-7 text-right shrink-0">{i + 1}</span>
            <span className="text-muted-foreground/80 whitespace-pre-wrap break-all">{line}</span>
          </div>
        ))}
        {!content && <p className="px-3 py-3 text-muted-foreground/50 text-[11px]">Could not fetch file content.</p>}
      </div>
      {file.head_content && file.base_content && (
        <div className="px-3 py-2 border-t border-amber-900/20 bg-amber-950/10">
          <p className="text-[10px] text-amber-400/70">
            ↑ Compare the two tabs — keep the lines you want, remove the rest, then save and commit.
          </p>
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
  const [open, setOpen]         = useState(false)
  const [patch, setPatch]       = useState<string | null>(f.patch ?? null)
  const [generating, setGen]    = useState(false)
  const [applying, setApplying] = useState<"commit" | "pr" | null>(null)
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
                    onClick={() => handleApply("commit")}
                    disabled={!!applying}
                  >
                    {applying === "commit" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Commit to branch
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    className="h-7 text-xs gap-1.5 border-blue-900/50 text-blue-400 hover:bg-blue-950/40"
                    onClick={() => handleApply("pr")}
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
    </Collapsible>
  )
}

/* ── ReviewCard ──────────────────────────────────────────────── */

function ReviewCard({ r, agentFilter }: { r: Review; agentFilter: string }) {
  const [expanded, setExpanded]   = useState(false)
  const [merging, setMerging]     = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const hasConflicts = r.mergeable_state === "dirty"
  const st = STATUS[r.status] ?? STATUS.pending

  const doMerge = () => {
    setConfirmOpen(false)
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
                    <span className="text-[11px] text-green-400">✓ Clean PR</span>
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
                  : agentFilter === "all" ? "🎉 No issues found" : `No ${agentFilter} findings`}
              </p>
            ) : (
              findings.map(f => <FindingRow key={f.id} f={f} reviewId={r.id} />)
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
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
          {r.findings.some(f => f.severity === "critical" || f.severity === "high") && (
            <div className="mt-3 flex gap-2 items-start bg-red-950/30 border border-red-900/50 rounded-xl px-3 py-2">
              <AlertTriangle className="text-red-400 h-4 w-4 shrink-0 mt-0.5" />
              <p className="text-xs text-red-400">
                This PR has unresolved critical/high findings from the AI review.
              </p>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button size="sm" variant="outline" className="h-8 text-xs">Cancel</Button>
            </DialogClose>
            <Button
              size="sm"
              className="h-8 text-xs gap-1 bg-purple-700 hover:bg-purple-600 text-white"
              onClick={doMerge}
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
  const { reviews, loading, error, refresh } = useReviews(page)

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
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={refresh} className="h-8 w-8">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowSettings(true)} className="gap-1.5">
              <Settings className="h-3.5 w-3.5" />
              Connect Repo
            </Button>
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

        {loading && (
          <div className="flex flex-col items-center py-24 text-muted-foreground">
            <span className="text-4xl mb-4 animate-pulse-dot">🛡️</span>
            <p className="text-sm">Loading reviews…</p>
          </div>
        )}
        {error && (
          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="px-5 py-4 text-destructive text-sm">⚠️ {error}</CardContent>
          </Card>
        )}
        {!loading && !error && reviews.length === 0 && (
          <div className="flex flex-col items-center py-24 text-muted-foreground">
            <span className="text-5xl mb-4">📭</span>
            <p className="text-base text-foreground/60 mb-2">No reviews yet</p>
            <p className="text-sm mb-6">Open a PR on a connected repo to trigger a review</p>
            <Button variant="outline" onClick={() => setShowSettings(true)} className="gap-2">
              <Settings className="h-3.5 w-3.5" />
              Connect a Repo
            </Button>
          </div>
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

      <SettingsDrawer open={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  )
}
