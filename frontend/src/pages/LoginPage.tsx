import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    color: "border-zinc-800",
    highlight: false,
    features: ["1 repo", "50 AI reviews / month", "3-agent analysis"],
  },
  {
    name: "Pro",
    price: "$12",
    period: "/ month",
    color: "border-violet-500",
    highlight: true,
    features: ["10 repos", "Unlimited reviews", "Team up to 5", "Priority queue"],
  },
  {
    name: "Team",
    price: "$39",
    period: "/ month",
    color: "border-zinc-700",
    highlight: false,
    features: ["Unlimited repos", "Unlimited reviews", "Unlimited members", "Admin bypass"],
  },
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
      <header className="flex items-center gap-3 px-8 py-5 border-b border-zinc-900">
        <div className="flex items-center gap-2.5">
          <img src="/shield.svg" alt="" className="h-6 w-6" onError={e => (e.currentTarget.style.display = "none")} />
          <span className="font-semibold tracking-tight text-lg">PatchSense</span>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 uppercase tracking-wider">Beta</span>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center gap-16 px-6 py-16">
        <div className="text-center max-w-xl">
          <h1 className="text-4xl font-bold tracking-tight mb-4">
            AI-powered PR review<br />
            <span className="text-violet-400">before it hits main</span>
          </h1>
          <p className="text-zinc-400 text-base leading-relaxed mb-8">
            PatchSense runs three AI agents — security, performance, and style —
            on every pull request and surfaces findings inline. Connect a repo in
            seconds, no CI config required.
          </p>
          <Button
            onClick={signInWithGitHub}
            className="gap-2.5 bg-zinc-100 text-zinc-900 hover:bg-white px-6 py-2.5 text-sm font-medium rounded-lg"
          >
            Continue with GitHub
          </Button>
          <p className="text-zinc-600 text-xs mt-3">Free plan · No credit card required</p>
        </div>

        {/* Pricing */}
        <div className="w-full max-w-3xl">
          <p className="text-center text-zinc-500 text-sm mb-6 uppercase tracking-widest text-xs">Pricing</p>
          <div className="grid grid-cols-3 gap-4">
            {PLANS.map(plan => (
              <div
                key={plan.name}
                className={`rounded-xl border p-5 flex flex-col gap-4 ${plan.color} ${plan.highlight ? "bg-violet-950/20" : "bg-zinc-900/40"}`}
              >
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold">{plan.price}</span>
                    <span className="text-zinc-500 text-sm">{plan.period}</span>
                  </div>
                  <div className="text-zinc-300 font-medium mt-0.5">{plan.name}</div>
                </div>
                <ul className="flex flex-col gap-2 text-sm text-zinc-400">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-2">
                      <span className="text-violet-400">✓</span> {f}
                    </li>
                  ))}
                </ul>
                {plan.highlight && (
                  <div className="text-[10px] text-violet-400 font-medium uppercase tracking-wider">Most popular</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
