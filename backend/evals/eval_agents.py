"""Agent evaluation script using real PR diffs from public GitHub repositories.

Usage:
    cd backend
    GEMINI_API_KEY=... LANGCHAIN_API_KEY=... python -m evals.eval_agents

Each eval case specifies a public repo + PR number. The script fetches the real
diff, runs all three agents, and prints a structured report with finding counts
and quality checks.

Set GITHUB_PAT in .env for higher rate limits (optional but recommended).
"""
import asyncio
import json
import sys
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

GITHUB_API = "https://api.github.com"

# ---------------------------------------------------------------------------
# Real PR examples from public repos covering known issues in each category
# ---------------------------------------------------------------------------
EVAL_CASES = [
    {
        "name": "security: hardcoded creds + injection",
        "repo": "juice-shop/juice-shop",
        "pr": 2228,
        "expect_agent": "security",
        "expect_min_findings": 0,
        "notes": "OWASP juice-shop — public intentionally-vulnerable app PRs",
    },
    {
        "name": "performance: N+1 query pattern",
        "repo": "encode/django-rest-framework",
        "pr": 9001,
        "expect_agent": "performance",
        "expect_min_findings": 0,
        "notes": "DRF PR — may contain DB query patterns",
    },
    {
        "name": "style: naming + dead code",
        "repo": "psf/black",
        "pr": 4000,
        "expect_agent": "style",
        "expect_min_findings": 0,
        "notes": "Black formatter PR — style issues possible",
    },
    {
        "name": "clean diff: no issues expected",
        "repo": "tiangolo/fastapi",
        "pr": 11000,
        "expect_agent": None,
        "expect_min_findings": 0,
        "notes": "FastAPI docs PR — typically clean",
    },
]


@dataclass
class EvalResult:
    name: str
    repo: str
    pr: int
    diff_lines: int
    findings: list[dict[str, Any]] = field(default_factory=list)
    elapsed_s: float = 0.0
    error: str | None = None

    @property
    def by_severity(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for f in self.findings:
            counts[f["severity"]] = counts.get(f["severity"], 0) + 1
        return counts

    @property
    def by_agent(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for f in self.findings:
            counts[f["agent"]] = counts.get(f["agent"], 0) + 1
        return counts


def fetch_pr_diff(repo: str, pr: int, pat: str | None = None) -> str:
    headers = {"Accept": "application/vnd.github.v3.diff"}
    if pat:
        headers["Authorization"] = f"Bearer {pat}"
    url = f"{GITHUB_API}/repos/{repo}/pulls/{pr}"
    resp = httpx.get(url, headers=headers, follow_redirects=True, timeout=15)
    if resp.status_code == 404:
        return ""
    resp.raise_for_status()
    return resp.text


async def run_case(case: dict[str, Any], pat: str | None) -> EvalResult:
    from app.agents.orchestrator import run_all_agents

    result = EvalResult(name=case["name"], repo=case["repo"], pr=case["pr"], diff_lines=0)
    try:
        diff = fetch_pr_diff(case["repo"], case["pr"], pat)
        if not diff:
            result.error = "PR not found or repo private"
            return result
        result.diff_lines = diff.count("\n")
        t0 = time.perf_counter()
        result.findings = await run_all_agents(diff)
        result.elapsed_s = time.perf_counter() - t0
    except Exception as exc:
        result.error = str(exc)
    return result


def print_report(results: list[EvalResult]) -> None:
    print("\n" + "=" * 70)
    print("PatchSense Agent Evaluation Report")
    print("=" * 70)
    for r in results:
        print(f"\n▶  {r.name}")
        print(f"   repo: {r.repo}  PR #{r.pr}")
        if r.error:
            print(f"   ❌ error: {r.error}")
            continue
        print(f"   diff lines : {r.diff_lines}")
        print(f"   elapsed    : {r.elapsed_s:.1f}s")
        print(f"   findings   : {len(r.findings)} total")
        if r.findings:
            print(f"   by severity: {json.dumps(r.by_severity)}")
            print(f"   by agent   : {json.dumps(r.by_agent)}")
            for f in r.findings[:3]:
                print(f"     [{f['severity'].upper():8}] {f['file_path']}:{f.get('line_number','?')} — {f['message'][:80]}")
            if len(r.findings) > 3:
                print(f"     ... and {len(r.findings) - 3} more")
    print("\n" + "=" * 70)
    total = sum(len(r.findings) for r in results if not r.error)
    errors = sum(1 for r in results if r.error)
    print(f"Summary: {len(results) - errors}/{len(results)} cases ran · {total} total findings")
    print("=" * 70 + "\n")


async def main() -> None:
    import os
    import sys

    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

    from dotenv import load_dotenv
    load_dotenv()

    pat = os.environ.get("GITHUB_PAT")
    if not pat:
        print("⚠  GITHUB_PAT not set — using unauthenticated GitHub API (60 req/hr limit)")

    print(f"Running {len(EVAL_CASES)} eval cases...")
    results = []
    for case in EVAL_CASES:
        print(f"  fetching {case['repo']} PR #{case['pr']} ...")
        r = await run_case(case, pat)
        results.append(r)

    print_report(results)


if __name__ == "__main__":
    asyncio.run(main())
