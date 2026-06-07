import asyncio
from typing import Any

from langsmith import traceable

from app.agents.security_agent import run_security_agent
from app.agents.performance_agent import run_performance_agent
from app.agents.style_agent import run_style_agent
from app.agents.deduplicator import deduplicate_findings, rank_findings


# Fans out to all specialist agents in parallel and returns merged ranked findings
@traceable(name="orchestrator")
async def run_all_agents(diff: str) -> list[dict[str, Any]]:
    results = await asyncio.gather(
        run_security_agent(diff),
        run_performance_agent(diff),
        run_style_agent(diff),
        return_exceptions=True,
    )
    all_findings = []
    for result in results:
        if isinstance(result, list):
            all_findings.extend(result)
    return rank_findings(deduplicate_findings(all_findings))
