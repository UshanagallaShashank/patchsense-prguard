import asyncio
from typing import Any

from langsmith import traceable

from app.agents.security_agent import run_security_agent
from app.agents.performance_agent import run_performance_agent
from app.agents.style_agent import run_style_agent
from app.agents.deduplicator import deduplicate_findings, rank_findings


@traceable(name="orchestrator")
async def run_all_agents(diff: str, repo_context: str = "") -> list[dict[str, Any]]:
    """Fan out to all specialist agents in parallel and return merged, ranked findings."""
    results = await asyncio.gather(
        run_security_agent(diff, repo_context),
        run_performance_agent(diff, repo_context),
        run_style_agent(diff, repo_context),
        return_exceptions=True,
    )
    all_findings: list[dict[str, Any]] = []
    for result in results:
        if isinstance(result, list):
            all_findings.extend(result)
    return rank_findings(deduplicate_findings(all_findings))
