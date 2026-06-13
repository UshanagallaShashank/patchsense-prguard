import { useState } from "react"
import { GitBranch, Loader2, CheckCircle2, AlertCircle, ArrowRight, Webhook, Zap, Eye } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { connectRepo } from "../services/api"

function parseRepoUrl(raw: string): string | null {
  const trimmed = raw.trim()
  try {
    const url = new URL(trimmed)
    if (url.hostname !== "github.com") return null
    const parts = url.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/")
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null
  } catch {
    return /^[\w.\-]+\/[\w.\-]+$/.test(trimmed) ? trimmed : null
  }
}

type Step = "input" | "confirm" | "connecting" | "done"

interface Props {
  open: boolean
  onClose: () => void
  onConnected?: (repoFullName: string) => void
}

const STEP_LABELS = ["Enter URL", "Confirm", "Connecting", "Done"]
const STEP_INDEX: Record<Step, number> = { input: 0, confirm: 1, connecting: 2, done: 3 }

function StepDots({ step }: { step: Step }) {
  const current = STEP_INDEX[step]
  return (
    <div className="flex items-center gap-2 mb-6">
      {STEP_LABELS.map((label, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={cn(
            "flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold transition-colors",
            i < current  ? "bg-violet-600 text-white"
            : i === current ? "bg-violet-600 text-white ring-2 ring-violet-400/40"
            : "bg-zinc-800 text-zinc-500"
          )}>
            {i < current ? "✓" : i + 1}
          </div>
          <span className={cn("text-[11px] font-medium hidden sm:block",
            i === current ? "text-zinc-200" : "text-zinc-600"
          )}>
            {label}
          </span>
          {i < STEP_LABELS.length - 1 && (
            <div className={cn("h-px w-4 transition-colors", i < current ? "bg-violet-600" : "bg-zinc-800")} />
          )}
        </div>
      ))}
    </div>
  )
}

export function ConnectRepoModal({ open, onClose, onConnected }: Props) {
  const [step, setStep]         = useState<Step>("input")
  const [url, setUrl]           = useState("")
  const [fullName, setFullName] = useState("")
  const [error, setError]       = useState("")

  function reset() {
    setStep("input")
    setUrl("")
    setFullName("")
    setError("")
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleNext() {
    setError("")
    const parsed = parseRepoUrl(url)
    if (!parsed) {
      setError("Enter a valid GitHub URL (e.g. https://github.com/owner/repo) or owner/repo.")
      return
    }
    setFullName(parsed)
    setStep("confirm")
  }

  async function handleConnect() {
    setStep("connecting")
    setError("")
    try {
      await connectRepo(fullName)
      setStep("done")
      onConnected?.(fullName)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Connection failed")
      setStep("confirm")
    }
  }

  const [owner, repo] = fullName.split("/")

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-zinc-100">
            <div className="h-8 w-8 rounded-lg bg-violet-950/60 border border-violet-800/40 flex items-center justify-center shrink-0">
              <GitBranch className="h-4 w-4 text-violet-400" />
            </div>
            Connect a repository
          </DialogTitle>
          <DialogDescription className="text-zinc-500 text-sm">
            PatchSense auto-installs a webhook and reviews every PR.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2">
          <StepDots step={step} />

          {/* ── Step 1: URL input ─────────────────────── */}
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
                  onChange={e => { setUrl(e.target.value); setError("") }}
                  onKeyDown={e => e.key === "Enter" && handleNext()}
                  placeholder="https://github.com/owner/repo"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-600 transition-colors"
                />
                {error && (
                  <div className="flex items-center gap-1.5 mt-2 text-red-400 text-xs">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {error}
                  </div>
                )}
                <p className="text-[11px] text-zinc-600 mt-2">
                  You need admin access to the repo to install the webhook.
                </p>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleNext}
                  disabled={!url.trim()}
                  className="gap-2 bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40"
                >
                  Next
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 2: Confirm ───────────────────────── */}
          {step === "confirm" && (
            <div className="space-y-4">
              {/* Repo preview */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                  <GitBranch className="h-4 w-4 text-zinc-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-100">{fullName}</p>
                  <p className="text-[11px] text-zinc-500">github.com/{owner} / {repo}</p>
                </div>
              </div>

              {/* What will happen */}
              <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 px-4 py-3 space-y-2.5">
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-3">What happens next</p>
                {[
                  { icon: Webhook, color: "text-violet-400", text: "Webhook installed automatically on this repo" },
                  { icon: Zap,     color: "text-yellow-400", text: "Every new PR triggers an AI code review" },
                  { icon: Eye,     color: "text-blue-400",   text: "Reviews appear live in your dashboard" },
                ].map(({ icon: Icon, color, text }) => (
                  <div key={text} className="flex items-center gap-2.5 text-sm text-zinc-300">
                    <Icon className={cn("h-4 w-4 shrink-0", color)} />
                    {text}
                  </div>
                ))}
              </div>

              {error && (
                <div className="flex items-center gap-1.5 text-red-400 text-xs">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {error}
                </div>
              )}

              <div className="flex gap-2 justify-between">
                <Button variant="outline" size="sm" onClick={() => setStep("input")} className="border-zinc-800 text-zinc-400">
                  Back
                </Button>
                <Button
                  onClick={handleConnect}
                  className="gap-2 bg-violet-600 hover:bg-violet-500 text-white"
                >
                  Connect repo
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 3: Connecting ────────────────────── */}
          {step === "connecting" && (
            <div className="flex flex-col items-center py-10 gap-4">
              <div className="relative">
                <div className="h-16 w-16 rounded-2xl bg-violet-950/50 border border-violet-800/40 flex items-center justify-center">
                  <Loader2 className="h-7 w-7 text-violet-400 animate-spin" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-zinc-200">Installing webhook…</p>
                <p className="text-[12px] text-zinc-500 mt-1">Connecting <span className="font-mono text-zinc-400">{fullName}</span></p>
              </div>
              <div className="flex flex-col gap-1.5 text-[11px] text-zinc-600 text-center">
                <p>Verifying repo access</p>
                <p>Registering webhook on GitHub</p>
                <p>Saving to your account</p>
              </div>
            </div>
          )}

          {/* ── Step 4: Done ──────────────────────────── */}
          {step === "done" && (
            <div className="space-y-5">
              <div className="flex flex-col items-center py-6 gap-3">
                <div className="h-16 w-16 rounded-2xl bg-emerald-950/40 border border-emerald-800/40 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                </div>
                <div className="text-center">
                  <p className="text-base font-bold text-zinc-100">Repo connected!</p>
                  <p className="text-[12px] text-zinc-500 mt-1 font-mono">{fullName}</p>
                </div>
              </div>

              {/* Next step callout */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">What's next</p>
                <p className="text-sm text-zinc-300 leading-relaxed">
                  Open a pull request on <span className="font-mono text-zinc-200">{fullName}</span> — PatchSense will automatically review it and show results here.
                </p>
                <a
                  href={`https://github.com/${fullName}/compare`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-3 text-xs text-violet-400 hover:text-violet-300 transition-colors underline underline-offset-2"
                >
                  Open a PR on GitHub ↗
                </a>
              </div>

              <div className="flex gap-2 justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { reset() }}
                  className="border-zinc-800 text-zinc-400"
                >
                  Connect another
                </Button>
                <Button
                  onClick={handleClose}
                  className="bg-violet-600 hover:bg-violet-500 text-white"
                >
                  Done
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
