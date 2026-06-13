import { useState } from "react"
import {
  GitBranch, Loader2, CheckCircle2, AlertCircle, ArrowRight,
  Zap, Eye, Shield, ShieldCheck, GitPullRequest,
  Sparkles, XCircle, RefreshCw, Crown, Users,
} from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { connectRepo, updateMyPlan } from "../services/api"
import { useAuth } from "../context/AuthContext"
import { BASE } from "../services/api"

/* ── helpers ─────────────────────────────────────────────────────── */

function parseRepoUrl(raw: string): string | null {
  const t = raw.trim()
  try {
    const url = new URL(t)
    if (url.hostname !== "github.com") return null
    const parts = url.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/")
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null
  } catch {
    return /^[\w.\-]+\/[\w.\-]+$/.test(t) ? t : null
  }
}

/* ── step types ──────────────────────────────────────────────────── */

type Phase = "setup" | "connect" | "done"
type Step =
  | "s1" | "s2" | "s4" | "s5" | "s6"  // 5 setup slides
  | "input" | "confirm" | "connecting"  // connect phase
  | "done" | "error"                    // result

const SETUP_STEPS: Step[] = ["s1", "s2", "s4", "s5", "s6"]
const CONNECT_STEPS: Step[] = ["input", "confirm", "connecting"]

function getPhase(step: Step): Phase {
  if (SETUP_STEPS.includes(step)) return "setup"
  if (CONNECT_STEPS.includes(step)) return "connect"
  return "done"
}

function getSetupIndex(step: Step) {
  return SETUP_STEPS.indexOf(step) // -1 if not a setup step
}

/* ── phase indicator ─────────────────────────────────────────────── */

function PhaseBar({ step }: { step: Step }) {
  const phase = getPhase(step)
  const setupIdx = getSetupIndex(step)

  const phases: { key: Phase; label: string }[] = [
    { key: "setup",   label: "Setup" },
    { key: "connect", label: "Connect" },
    { key: "done",    label: "Done" },
  ]

  return (
    <div className="mb-6">
      {/* Phase tabs */}
      <div className="flex items-center gap-1 mb-3">
        {phases.map(({ key, label }, i) => {
          const isDone  = (key === "setup" && phase !== "setup")
                       || (key === "connect" && phase === "done")
          const active  = key === phase
          return (
            <div key={key} className="flex items-center gap-1">
              <span className={cn(
                "text-[11px] font-semibold px-2 py-0.5 rounded-full transition-colors",
                isDone  ? "text-violet-400 bg-violet-950/40"
                : active  ? "text-zinc-100 bg-zinc-800"
                : "text-zinc-600"
              )}>
                {isDone ? "✓ " : ""}{label}
              </span>
              {i < phases.length - 1 && <span className="text-zinc-700 text-xs">›</span>}
            </div>
          )
        })}
      </div>

      {/* Setup sub-dots (only visible during setup phase) */}
      {phase === "setup" && (
        <div className="flex gap-1.5">
          {SETUP_STEPS.map((_, i) => (
            <div key={i} className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i < setupIdx  ? "bg-violet-600"
              : i === setupIdx ? "bg-violet-400"
              : "bg-zinc-800"
            )} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ── plan cards ──────────────────────────────────────────────────── */

const PLANS = [
  {
    key: "free",
    label: "Free",
    price: "$0",
    color: "border-zinc-700 bg-zinc-900/40",
    activeColor: "border-zinc-500 bg-zinc-800/60",
    badge: null,
    icon: Shield,
    iconColor: "text-zinc-400",
    perks: ["1 repo", "No team members", "AI reviews"],
  },
  {
    key: "pro",
    label: "Pro",
    price: "$12/mo",
    color: "border-violet-900/50 bg-violet-950/20",
    activeColor: "border-violet-500 bg-violet-900/30",
    badge: "Most popular",
    icon: Crown,
    iconColor: "text-violet-400",
    perks: ["10 repos", "Up to 5 members", "Priority reviews"],
  },
  {
    key: "team",
    label: "Team",
    price: "$39/mo",
    color: "border-blue-900/50 bg-blue-950/20",
    activeColor: "border-blue-500 bg-blue-900/30",
    badge: null,
    icon: Users,
    iconColor: "text-blue-400",
    perks: ["Unlimited repos", "Unlimited members", "Admin bypass"],
  },
]

/* ── setup slide data ────────────────────────────────────────────── */


function Slide1() {
  return (
    <div className="flex flex-col items-center text-center py-4 gap-4">
      <div className="h-16 w-16 rounded-2xl bg-violet-950/50 border border-violet-800/40 flex items-center justify-center">
        <GitBranch className="h-8 w-8 text-violet-400" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-zinc-100">Connect a GitHub repo</h2>
        <p className="text-sm text-zinc-400 mt-1 leading-relaxed max-w-xs mx-auto">
          PatchSense will auto-install a webhook and start reviewing every PR — no CI config needed.
        </p>
      </div>
      <div className="flex flex-col gap-2 text-left w-full max-w-xs">
        {[
          "Takes ~30 seconds to connect",
          "No manual GitHub webhook setup",
          "AI reviews fire on every new PR",
        ].map(t => (
          <div key={t} className="flex items-center gap-2 text-[12px] text-zinc-400">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            {t}
          </div>
        ))}
      </div>
    </div>
  )
}

function Slide2({ userLogin }: { userLogin?: string }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-xl border border-emerald-800/40 bg-emerald-950/20 px-4 py-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-emerald-300">GitHub connected</p>
          <p className="text-[12px] text-zinc-500">Signed in as <span className="font-mono text-zinc-300">@{userLogin ?? "you"}</span></p>
        </div>
      </div>

      <div className="rounded-xl border border-amber-900/30 bg-amber-950/15 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-300">Admin access required</p>
            <p className="text-[12px] text-zinc-400 mt-1 leading-relaxed">
              You must be an <strong className="text-zinc-300">owner or admin</strong> of the repo to install the webhook.
              Fork owners and repo collaborators with write-only access will get a 403 error.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-[12px] text-zinc-400 leading-relaxed">
        Not sure? Go to <span className="font-mono text-zinc-300">github.com → Repo → Settings → Collaborators & teams</span> and confirm your role is <span className="font-mono text-zinc-300">Admin</span> or <span className="font-mono text-zinc-300">Owner</span>.
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border border-emerald-800/30 bg-emerald-950/15 px-4 py-3">
        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-[12px] font-semibold text-emerald-300">Webhook installed automatically</p>
          <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
            No manual GitHub webhook setup needed. PatchSense installs the webhook for you when you click <strong className="text-zinc-300">Connect repo</strong> — once per repo, never again.
          </p>
        </div>
      </div>
    </div>
  )
}

function Slide4() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-blue-950/40 border border-blue-800/40 flex items-center justify-center shrink-0 mt-0.5">
          <GitPullRequest className="h-4 w-4 text-blue-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-zinc-100">PR events only</p>
          <p className="text-[12px] text-zinc-400 mt-1">The webhook only fires on Pull Request activity — no noise from pushes, issues, or other events.</p>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 space-y-2.5">
        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Triggers a review when a PR is…</p>
        {[
          { label: "Opened",           dot: "bg-green-500" },
          { label: "Pushed to (synchronized)", dot: "bg-blue-500" },
          { label: "Reopened",         dot: "bg-yellow-500" },
          { label: "Ready for review", dot: "bg-violet-500" },
        ].map(({ label, dot }) => (
          <div key={label} className="flex items-center gap-2.5 text-[12px] text-zinc-300">
            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dot)} />
            {label}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 px-3 py-2 text-[11px] text-zinc-500">
        Draft PRs are ignored until marked "Ready for review".
      </div>
    </div>
  )
}

function Slide5({ selectedPlan, onPlanChange }: { selectedPlan: string; onPlanChange: (p: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-semibold text-zinc-100">Choose your plan</p>
        <p className="text-[12px] text-zinc-500 mt-0.5">You can upgrade at any time from settings.</p>
      </div>

      {PLANS.map(plan => {
        const Icon = plan.icon
        const active = selectedPlan === plan.key
        return (
          <button
            key={plan.key}
            onClick={() => onPlanChange(plan.key)}
            className={cn(
              "w-full text-left rounded-xl border px-4 py-3 transition-all",
              active ? plan.activeColor : plan.color,
              "hover:opacity-90"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Icon className={cn("h-4 w-4 shrink-0", plan.iconColor)} />
                <span className="text-sm font-semibold text-zinc-100">{plan.label}</span>
                {plan.badge && (
                  <Badge className="text-[9px] bg-violet-700/50 text-violet-300 border-violet-600/40 px-1.5">{plan.badge}</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-bold text-zinc-200">{plan.price}</span>
                {active && <CheckCircle2 className="h-4 w-4 text-violet-400" />}
              </div>
            </div>
            <div className="flex gap-3 mt-2">
              {plan.perks.map(p => (
                <span key={p} className="text-[11px] text-zinc-500">{p}</span>
              ))}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function Slide6() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-yellow-950/40 border border-yellow-800/40 flex items-center justify-center shrink-0 mt-0.5">
          <Sparkles className="h-4 w-4 text-yellow-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-zinc-100">AI-powered code review</p>
          <p className="text-[12px] text-zinc-400 mt-1">3 specialized agents analyze every PR diff.</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: Shield,   label: "Security",    color: "text-red-400",    bg: "bg-red-950/30 border-red-900/40" },
          { icon: Zap,      label: "Performance", color: "text-yellow-400", bg: "bg-yellow-950/30 border-yellow-900/40" },
          { icon: Sparkles, label: "Style",       color: "text-purple-400", bg: "bg-purple-950/30 border-purple-900/40" },
        ].map(({ icon: Icon, label, color, bg }) => (
          <div key={label} className={cn("rounded-lg border px-3 py-2.5 flex flex-col items-center gap-1.5", bg)}>
            <Icon className={cn("h-4 w-4", color)} />
            <span className={cn("text-[11px] font-semibold", color)}>{label}</span>
          </div>
        ))}
      </div>

      {/* AI disclaimer — important */}
      <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 px-4 py-3 flex items-start gap-2.5">
        <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-[12px] font-semibold text-amber-300">AI can make mistakes</p>
          <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
            Findings and auto-fixes are suggestions only. Always review AI output before merging, committing, or applying patches to production code.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-zinc-500">
        <Eye className="h-3.5 w-3.5 shrink-0" />
        Results appear in real-time in your dashboard.
      </div>
    </div>
  )
}

/* ── main modal ──────────────────────────────────────────────────── */

interface Props {
  open: boolean
  onClose: () => void
  onConnected?: (repoFullName: string) => void
  skipSetup?: boolean  // true when user already has connected repos
}

const SLIDE_TITLES: Record<string, string> = {
  s1: "Getting started",
  s2: "Prerequisites",
  s4: "What triggers a review",
  s5: "Choose your plan",
  s6: "AI review agents",
  input:      "Enter your repo URL",
  confirm:    "Confirm connection",
  connecting: "Connecting…",
  done:       "All done!",
  error:      "Connection failed",
}

const SETUP_ORDER: Step[] = ["s1","s2","s4","s5","s6","input","confirm","connecting"]

function nextStep(s: Step): Step {
  const idx = SETUP_ORDER.indexOf(s)
  return idx >= 0 && idx < SETUP_ORDER.length - 1 ? SETUP_ORDER[idx + 1] : s
}
function prevStep(s: Step): Step {
  const idx = SETUP_ORDER.indexOf(s)
  return idx > 0 ? SETUP_ORDER[idx - 1] : s
}

export function ConnectRepoModal({ open, onClose, onConnected, skipSetup = false }: Props) {
  const { user, profile } = useAuth()
  const [step, setStep]           = useState<Step>(skipSetup ? "input" : "s1")
  const [url, setUrl]             = useState("")
  const [fullName, setFullName]   = useState("")
  const [urlError, setUrlError]   = useState("")
  const [connError, setConnError] = useState("")
  const [selectedPlan, setSelectedPlan] = useState<string>(profile?.plan ?? "free")

  function reset() {
    setStep(skipSetup ? "input" : "s1")
    setUrl("")
    setFullName("")
    setUrlError("")
    setConnError("")
  }

  function handleClose() { reset(); onClose() }

  async function handleNext() {
    if (step === "s5") {
      try { await updateMyPlan(selectedPlan) } catch { /* non-fatal */ }
    }
    if (step === "input") {
      const parsed = parseRepoUrl(url)
      if (!parsed) {
        setUrlError("Enter a valid GitHub URL (e.g. https://github.com/owner/repo) or owner/repo.")
        return
      }
      setFullName(parsed)
      setUrlError("")
    }
    setStep(s => nextStep(s))
  }

  function handleBack() { setStep(s => prevStep(s)) }

  async function handleConnect() {
    setStep("connecting")
    setConnError("")
    try {
      await connectRepo(fullName)
      setStep("done")
      onConnected?.(fullName)
    } catch (e: unknown) {
      setConnError(e instanceof Error ? e.message : "Connection failed — please try again.")
      setStep("error")
    }
  }

  const isFirst = step === "s1"
  const [owner, repo] = fullName.split("/")
  const userLogin = user?.user_metadata?.user_name as string | undefined

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <DialogContent className="sm:max-w-lg bg-zinc-950 border-zinc-800 p-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-zinc-800/60">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="h-7 w-7 rounded-lg bg-violet-950/60 border border-violet-800/40 flex items-center justify-center shrink-0">
              <GitBranch className="h-3.5 w-3.5 text-violet-400" />
            </div>
            <span className="text-sm font-bold text-zinc-100">Connect a repository</span>
          </div>
          <p className="text-xs text-zinc-500 ml-9">{SLIDE_TITLES[step]}</p>
        </div>

        {/* Scrollable content area — fixed height so nav buttons never go off-screen */}
        <div className="flex flex-col" style={{ maxHeight: "calc(100dvh - 140px)" }}>
          <div className="flex-1 overflow-y-auto px-6 pt-5 pb-2">
          <PhaseBar step={step} />

          {/* ── Setup slides ──────────────────────── */}
          {step === "s1" && <Slide1 />}
          {step === "s2" && <Slide2 userLogin={userLogin} />}
          {step === "s4" && <Slide4 />}
          {step === "s5" && <Slide5 selectedPlan={selectedPlan} onPlanChange={setSelectedPlan} />}
          {step === "s6" && <Slide6 />}

          {/* ── URL input ─────────────────────────── */}
          {step === "input" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">
                  GitHub repo URL
                </label>
                <input
                  autoFocus
                  type="text"
                  value={url}
                  onChange={e => { setUrl(e.target.value); setUrlError("") }}
                  onKeyDown={e => e.key === "Enter" && handleNext()}
                  placeholder="https://github.com/owner/repo  or  owner/repo"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-600 transition-colors"
                />
                {urlError && (
                  <div className="flex items-center gap-1.5 mt-2 text-red-400 text-xs">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {urlError}
                  </div>
                )}
                <p className="text-[11px] text-zinc-600 mt-2">
                  Requires admin/owner access — confirmed in the previous steps.
                </p>
              </div>
            </div>
          )}

          {/* ── Confirm ───────────────────────────── */}
          {step === "confirm" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                  <GitBranch className="h-4 w-4 text-zinc-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-100">{fullName}</p>
                  <p className="text-[11px] text-zinc-500">github.com/{owner} / {repo}</p>
                </div>
                <Badge className="ml-auto text-[10px] bg-zinc-800 text-zinc-400 border-zinc-700">{selectedPlan}</Badge>
              </div>

              <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 px-4 py-3 space-y-2">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">PatchSense will</p>
                {[
                  { icon: Webhook,        color: "text-violet-400", text: "Install a webhook on this repo via GitHub API" },
                  { icon: KeyRound,       color: "text-zinc-400",   text: "Generate and store a unique webhook secret" },
                  { icon: GitPullRequest, color: "text-blue-400",   text: "Trigger an AI review on every new PR" },
                  { icon: Eye,            color: "text-emerald-400",text: "Show results live in your dashboard" },
                ].map(({ icon: Icon, color, text }) => (
                  <div key={text} className="flex items-center gap-2.5 text-[12px] text-zinc-300">
                    <Icon className={cn("h-3.5 w-3.5 shrink-0", color)} />
                    {text}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Connecting ────────────────────────── */}
          {step === "connecting" && (
            <div className="flex flex-col items-center py-8 gap-4">
              <div className="h-16 w-16 rounded-2xl bg-violet-950/50 border border-violet-800/40 flex items-center justify-center">
                <Loader2 className="h-7 w-7 text-violet-400 animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-zinc-200">Installing webhook…</p>
                <p className="text-[12px] text-zinc-500 mt-1 font-mono">{fullName}</p>
              </div>
              <div className="flex flex-col gap-1.5 text-[11px] text-zinc-600 text-center">
                <p>Verifying admin access</p>
                <p>Registering webhook on GitHub</p>
                <p>Generating per-repo secret</p>
                <p>Saving to your account</p>
              </div>
            </div>
          )}

          {/* ── Done ──────────────────────────────── */}
          {step === "done" && (
            <div className="space-y-5">
              <div className="flex flex-col items-center py-4 gap-3">
                <div className="h-16 w-16 rounded-2xl bg-emerald-950/40 border border-emerald-800/40 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                </div>
                <div className="text-center">
                  <p className="text-base font-bold text-zinc-100">Repo connected!</p>
                  <p className="text-[12px] text-zinc-500 mt-1 font-mono">{fullName}</p>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 space-y-2.5">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">What's next</p>
                <p className="text-[12px] text-zinc-300 leading-relaxed">
                  Open a pull request on <span className="font-mono text-zinc-200">{fullName}</span> and PatchSense will automatically queue a review.
                </p>
                <a
                  href={`https://github.com/${fullName}/compare`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[12px] text-violet-400 hover:text-violet-300 underline underline-offset-2"
                >
                  Open a PR on GitHub ↗
                </a>
              </div>

              <div className="rounded-xl border border-amber-900/30 bg-amber-950/15 px-3 py-2.5 flex items-start gap-2">
                <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  <strong className="text-amber-300">Reminder:</strong> AI reviews are suggestions — always read them before merging or applying auto-fixes.
                </p>
              </div>
            </div>
          )}

          {/* ── Error ─────────────────────────────── */}
          {step === "error" && (() => {
            const isPlanLimit = connError.toLowerCase().includes("repo limit reached")
            return (
            <div className="space-y-4">
              <div className="flex flex-col items-center py-4 gap-3">
                <div className="h-16 w-16 rounded-2xl bg-red-950/30 border border-red-800/40 flex items-center justify-center">
                  <XCircle className="h-8 w-8 text-red-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-zinc-100">Connection failed</p>
                  <p className="text-[12px] text-zinc-500 mt-1 font-mono">{fullName}</p>
                </div>
              </div>

              <div className="rounded-xl border border-red-900/40 bg-red-950/20 px-4 py-3">
                <p className="text-[11px] font-semibold text-red-400 mb-1">Error details</p>
                <p className="text-[12px] text-zinc-300">{connError}</p>
              </div>

              {isPlanLimit ? (
                <div className="rounded-xl border border-violet-800/40 bg-violet-950/20 px-4 py-4 space-y-3">
                  <p className="text-[11px] font-semibold text-violet-300">Upgrade to connect more repos</p>
                  <div className="space-y-2">
                    {PLANS.filter(p => p.key !== "free").map(plan => {
                      const Icon = plan.icon
                      return (
                        <button
                          key={plan.key}
                          onClick={async () => {
                            try {
                              await updateMyPlan(plan.key)
                            } catch {
                              setConnError("Failed to upgrade plan — please try again.")
                              return
                            }
                            setSelectedPlan(plan.key)
                            setStep("connecting")
                            setConnError("")
                            try {
                              await connectRepo(fullName)
                              setStep("done")
                              onConnected?.(fullName)
                            } catch (e: unknown) {
                              setConnError(e instanceof Error ? e.message : "Connection failed — please try again.")
                              setStep("error")
                            }
                          }}
                          className={cn(
                            "w-full text-left rounded-lg border px-3 py-2.5 transition-all hover:opacity-90 flex items-center justify-between gap-2",
                            plan.color
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <Icon className={cn("h-3.5 w-3.5 shrink-0", plan.iconColor)} />
                            <span className="text-[12px] font-semibold text-zinc-100">{plan.label}</span>
                            {plan.badge && <Badge className="text-[9px] bg-violet-700/50 text-violet-300 border-violet-600/40 px-1.5">{plan.badge}</Badge>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] text-zinc-400">{plan.perks[0]}</span>
                            <span className="text-[12px] font-bold text-zinc-200">{plan.price}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-[10px] text-zinc-600">Selecting a plan upgrades your account and immediately retries connecting your repo.</p>
                  <Button variant="outline" size="sm" onClick={handleClose} className="w-full border-zinc-800 text-zinc-500 mt-1">
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 space-y-1.5">
                  <p className="text-[11px] font-semibold text-zinc-400">Common causes</p>
                  {[
                    "You don't have admin access to this repo",
                    "The repo URL was entered incorrectly",
                    "A webhook already exists with a different secret",
                    "GitHub API rate limit (try again in a moment)",
                  ].map(t => (
                    <div key={t} className="flex items-start gap-2 text-[11px] text-zinc-500">
                      <span className="text-zinc-700 shrink-0">•</span>
                      {t}
                    </div>
                  ))}
                </div>
              )}
            </div>
            )
          })()}

          </div>{/* end scrollable content */}

          {/* Sticky nav footer — always visible */}
          <div className={cn(
            "shrink-0 px-6 pb-5 pt-3 border-t border-zinc-800/60",
            step === "connecting" && "hidden"
          )}>
            {step !== "done" && step !== "error" && (
              <div className={cn("flex", isFirst ? "justify-end" : "justify-between")}>
                {!isFirst && (
                  <Button variant="outline" size="sm" onClick={handleBack} className="border-zinc-800 text-zinc-400">
                    Back
                  </Button>
                )}
                {step !== "confirm" && (
                  <Button
                    onClick={handleNext}
                    disabled={step === "input" && !url.trim()}
                    className="gap-2 bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40"
                  >
                    Next
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
                {step === "confirm" && (
                  <Button onClick={handleConnect} className="gap-2 bg-violet-600 hover:bg-violet-500 text-white">
                    Connect repo
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}

            {step === "done" && (
              <div className="flex gap-2 justify-between">
                <Button variant="outline" size="sm" onClick={reset} className="border-zinc-800 text-zinc-400">
                  Connect another
                </Button>
                <Button onClick={handleClose} className="bg-violet-600 hover:bg-violet-500 text-white">
                  Done
                </Button>
              </div>
            )}

            {step === "error" && !connError.toLowerCase().includes("repo limit reached") && (
              <div className="flex gap-2 justify-between">
                <Button variant="outline" size="sm" onClick={() => setStep("input")} className="border-zinc-800 text-zinc-400 gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Try again
                </Button>
                <Button variant="outline" size="sm" onClick={handleClose} className="border-zinc-800 text-zinc-400">
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>{/* end flex-col wrapper */}
      </DialogContent>
    </Dialog>
  )
}
