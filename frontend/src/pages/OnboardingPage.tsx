import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GitBranch, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { connectRepo } from "../services/api";

function parseRepoUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.hostname !== "github.com") return null;
    const parts = url.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/");
    if (parts.length < 2) return null;
    return `${parts[0]}/${parts[1]}`;
  } catch {
    // maybe they typed "owner/repo" directly
    const match = raw.trim().match(/^[\w.-]+\/[\w.-]+$/);
    return match ? raw.trim() : null;
  }
}

export function OnboardingPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function handleConnect() {
    const fullName = parseRepoUrl(url);
    if (!fullName) {
      setError("Enter a valid GitHub URL or owner/repo.");
      return;
    }
    setStatus("loading");
    setError("");
    try {
      await connectRepo(fullName);
      setStatus("done");
      setTimeout(() => navigate("/"), 1500);
    } catch (e: unknown) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Connection failed");
    }
  }

  const isFirstTime = !profile;
  const greeting = user?.user_metadata?.full_name ?? user?.user_metadata?.user_name ?? "there";

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="h-14 w-14 rounded-2xl bg-violet-950/50 border border-violet-800/40 flex items-center justify-center">
            <GitBranch className="h-7 w-7 text-violet-400" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-center mb-1">
          {isFirstTime ? `Hey ${greeting} 👋` : "Connect a repo"}
        </h1>
        <p className="text-zinc-400 text-sm text-center mb-8">
          Paste a GitHub repo URL and PatchSense will auto-install the webhook — no manual config.
        </p>

        {/* Input */}
        <div className="flex flex-col gap-3">
          <input
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleConnect()}
            placeholder="https://github.com/owner/repo"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-600 transition-colors"
          />

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {status === "done" ? (
            <div className="flex items-center justify-center gap-2 text-emerald-400 text-sm py-2">
              <CheckCircle2 className="h-4 w-4" />
              Connected! Redirecting to dashboard…
            </div>
          ) : (
            <Button
              onClick={handleConnect}
              disabled={status === "loading" || !url.trim()}
              className="w-full gap-2 bg-violet-600 hover:bg-violet-500 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {status === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
              Connect repo
            </Button>
          )}
        </div>

        <div className="mt-6 flex flex-col items-center gap-2">
          <button
            onClick={() => navigate("/")}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 hover:bg-zinc-900 transition-all"
          >
            Skip for now →
          </button>
          <p className="text-[11px] text-zinc-700">You need admin access to the repo to install the webhook.</p>
        </div>
      </div>
    </div>
  );
}
