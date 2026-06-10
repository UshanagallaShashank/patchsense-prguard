"""Manually trigger a PR review: fetch diff → run agents → store in Supabase.

Usage:
    cd backend
    python -m scripts.run_review <repo> <pr_number>

Example:
    python -m scripts.run_review UshanagallaShashank/patchsense-prguard 7
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv
load_dotenv()

import httpx  # noqa: E402
from supabase import create_client  # noqa: E402


GITHUB_API = "https://api.github.com"


def fetch_diff(repo: str, pr: int) -> str:
    pat = os.environ.get("GITHUB_PAT")
    headers = {"Accept": "application/vnd.github.v3.diff"}
    if pat:
        headers["Authorization"] = f"Bearer {pat}"
    resp = httpx.get(f"{GITHUB_API}/repos/{repo}/pulls/{pr}", headers=headers, timeout=15, follow_redirects=True)
    resp.raise_for_status()
    return resp.text


def get_admin_client():
    url = os.environ["SUPABASE_URL"]
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ["SUPABASE_KEY"]
    return create_client(url, key)


async def run(repo: str, pr_number: int) -> None:
    from app.agents.orchestrator import run_all_agents

    client = get_admin_client()

    print(f"Fetching diff for {repo} PR #{pr_number}...")
    diff = fetch_diff(repo, pr_number)
    print(f"  {diff.count(chr(10))} lines of diff")

    review = client.table("reviews").insert({
        "repo_full_name": repo,
        "pr_number": pr_number,
        "status": "running",
    }).execute().data[0]
    review_id = review["id"]
    print(f"  Created review {review_id}")

    try:
        print("Running agents...")
        findings = await run_all_agents(diff)
        print(f"  {len(findings)} findings")

        if findings:
            rows = [
                {
                    "review_id": review_id,
                    "agent": f["agent"],
                    "severity": f["severity"],
                    "file_path": f["file_path"],
                    "line_number": f.get("line_number"),
                    "message": f["message"],
                    "suggestion": f.get("suggestion"),
                }
                for f in findings
            ]
            client.table("findings").insert(rows).execute()

        client.table("reviews").update({
            "status": "completed",
            "completed_at": "now()",
        }).eq("id", review_id).execute()
        print("  Done — review marked completed")

    except Exception as exc:
        client.table("reviews").update({"status": "failed"}).eq("id", review_id).execute()
        raise exc


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python -m scripts.run_review <repo> <pr_number>")
        sys.exit(1)
    asyncio.run(run(sys.argv[1], int(sys.argv[2])))
