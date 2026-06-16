import asyncio
import logging
import time
from typing import Any, Awaitable, Callable

from langsmith import traceable

from app.agents.security_agent import run_security_agent
from app.agents.performance_agent import run_performance_agent
from app.agents.style_agent import run_style_agent
from app.agents.deduplicator import deduplicate_findings, rank_findings
from app.core.config import settings

logger = logging.getLogger(__name__)

AgentFn = Callable[[str, str], Awaitable[list[dict[str, Any]]]]


async def _run_one(
    name: str, fn: AgentFn, diff: str, repo_context: str, timeout: float
) -> list[dict[str, Any]]:
    """Run a single agent with a timeout, isolating its failures from the rest."""
    start = time.monotonic()
    try:
        findings = await asyncio.wait_for(fn(diff, repo_context), timeout=timeout)
        logger.info(
            "agent=%s status=ok duration=%.2fs findings=%d",
            name, time.monotonic() - start, len(findings),
        )
        return findings
    except asyncio.TimeoutError:
        logger.warning(
            "agent=%s status=timeout duration=%.2fs timeout=%.0fs",
            name, time.monotonic() - start, timeout,
        )
        return []
    except Exception:
        logger.exception(
            "agent=%s status=error duration=%.2fs", name, time.monotonic() - start
        )
        return []


@traceable(name="orchestrator")
async def run_all_agents(
    diff: str,
    repo_context: str = "",
    agents: dict[str, AgentFn] | None = None,
    timeout_seconds: float | None = None,
) -> list[dict[str, Any]]:
    """Fan out to specialist agents in parallel and return merged, ranked findings.

    `agents` defaults to the built-in security/performance/style set but can be
    overridden (e.g. in evals, or to add a new specialist) without touching this
    module. Each agent gets `timeout_seconds` (defaults to
    settings.agent_timeout_seconds); a slow, failing, or timed-out agent is logged
    and excluded so it never blocks the others or the overall review.
    """
    agents = agents if agents is not None else {
        "security": run_security_agent,
        "performance": run_performance_agent,
        "style": run_style_agent,
    }
    timeout = timeout_seconds if timeout_seconds is not None else settings.agent_timeout_seconds

    results = await asyncio.gather(
        *(_run_one(name, fn, diff, repo_context, timeout) for name, fn in agents.items())
    )
    all_findings: list[dict[str, Any]] = [f for findings in results for f in findings]
    return rank_findings(deduplicate_findings(all_findings))
