import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Shield, Zap, Sparkles, Check, ArrowRight } from "lucide-react";

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    highlight: false,
    features: ["1 repo", "50 AI reviews / month", "3-agent analysis", "GitHub inline comments"],
  },
  {
    name: "Pro",
    price: "$12",
    period: "/ month",
    highlight: true,
    badge: "Most popular",
    features: ["10 repos", "Unlimited reviews", "Team up to 5", "Priority queue", "LangSmith traces"],
  },
  {
    name: "Team",
    price: "$39",
    period: "/ month",
    highlight: false,
    features: ["Unlimited repos", "Unlimited reviews", "Unlimited members", "Admin bypass", "SSO ready"],
  },
];

const AGENTS = [
  { icon: Shield,   label: "Security",    color: "text-red-400",    bg: "bg-red-950/40",    border: "border-red-900/40",    desc: "Finds vulnerabilities, injection risks, auth flaws" },
  { icon: Zap,      label: "Performance", color: "text-yellow-400", bg: "bg-yellow-950/40", border: "border-yellow-900/40", desc: "Catches N+1 queries, memory leaks, inefficient loops" },
  { icon: Sparkles, label: "Style",       color: "text-purple-400", bg: "bg-purple-950/40", border: "border-purple-900/40", desc: "Enforces conventions, readability, naming consistency" },
];

export function LoginPage() {
  const { session, signInWithGitHub } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (session) navigate("/", { replace: true });
  }, [session, navigate]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-zinc-900">
        <div className="flex items-center gap-2.5">
          <img src="/shield.svg" alt="" className="h-6 w-6" onError={e => (e.currentTarget.style.display = "none")} />
          <span className="font-semibold tracking-tight text-lg">PatchSense</span>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 uppercase tracking-wider">Beta</span>
        </div>
        <button
          onClick={signInWithGitHub}
          className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 hover:text-zinc-100 hover:border-zinc-700 transition-all"
        >
          <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" /></svg>
          Sign in
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center px-6 py-20">
        {/* Hero */}
        <div className="text-center max-w-2xl mb-16">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-800/50 bg-violet-950/30 px-3 py-1 text-[11px] text-violet-400 font-medium mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
            AI-powered PR review — no CI config required
          </div>

          <h1 className="text-5xl font-bold tracking-tight leading-tight mb-5">
            Catch issues before<br />
            <span className="text-violet-400">they reach main</span>
          </h1>
          <p className="text-zinc-400 text-lg leading-relaxed mb-10 max-w-lg mx-auto">
            Three specialized AI agents review every pull request for security vulnerabilities,
            performance bottlenecks, and style issues — automatically.
          </p>

          <div className="flex flex-col items-center gap-3">
            <button
              onClick={signInWithGitHub}
              className="flex items-center gap-3 bg-zinc-100 text-zinc-900 hover:bg-white px-8 py-3.5 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-zinc-900/50 group"
            >
              <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" /></svg>
              Continue with GitHub
              <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
            <p className="text-zinc-600 text-xs">Free plan · No credit card required</p>
          </div>
        </div>

        {/* Agent cards */}
        <div className="w-full max-w-3xl mb-20">
          <p className="text-center text-[11px] font-semibold text-zinc-600 uppercase tracking-widest mb-6">
            3 agents, 1 PR, instant feedback
          </p>
          <div className="grid grid-cols-3 gap-3">
            {AGENTS.map(agent => (
              <div
                key={agent.label}
                className={`rounded-xl border p-4 flex flex-col gap-3 ${agent.border} ${agent.bg}`}
              >
                <div className={`h-9 w-9 rounded-lg border ${agent.border} bg-black/20 flex items-center justify-center`}>
                  <agent.icon className={`h-4.5 w-4.5 ${agent.color}`} />
                </div>
                <div>
                  <p className={`text-sm font-semibold ${agent.color}`}>{agent.label}</p>
                  <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{agent.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pricing */}
        <div className="w-full max-w-3xl">
          <p className="text-center text-[11px] font-semibold text-zinc-600 uppercase tracking-widest mb-6">
            Simple pricing
          </p>
          <div className="grid grid-cols-3 gap-4">
            {PLANS.map(plan => (
              <div
                key={plan.name}
                className={`relative rounded-xl border p-5 flex flex-col gap-4 ${
                  plan.highlight
                    ? "border-violet-500/60 bg-violet-950/20 shadow-lg shadow-violet-900/20"
                    : "border-zinc-800 bg-zinc-900/40"
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-violet-600 px-3 py-0.5 text-[10px] font-semibold text-white whitespace-nowrap">
                    {plan.badge}
                  </div>
                )}
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold">{plan.price}</span>
                    <span className="text-zinc-500 text-sm">{plan.period}</span>
                  </div>
                  <div className={`font-semibold mt-0.5 ${plan.highlight ? "text-violet-300" : "text-zinc-300"}`}>
                    {plan.name}
                  </div>
                </div>
                <ul className="flex flex-col gap-2 flex-1">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm text-zinc-400">
                      <Check className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${plan.highlight ? "text-violet-400" : "text-zinc-500"}`} />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={signInWithGitHub}
                  className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                    plan.highlight
                      ? "bg-violet-600 hover:bg-violet-500 text-white"
                      : "border border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100"
                  }`}
                >
                  Get started
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Footer trust */}
        <div className="flex items-center gap-6 mt-16 text-[12px] text-zinc-600">
          <span>✓ Installs in 60 seconds</span>
          <span>✓ No source code stored</span>
          <span>✓ Webhook-based, always fresh</span>
        </div>
      </main>
    </div>
  );
}
