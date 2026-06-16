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


async def _run_attempt(
    name: str, fn: AgentFn, diff: str, repo_context: str, timeout: float, attempt: int
) -> list[dict[str, Any]] | None:
    """Run a single attempt at an agent call. Returns None on timeout/error so the
    caller can decide whether to retry, instead of swallowing the failure here."""
    start = time.monotonic()
    try:
        findings = await asyncio.wait_for(fn(diff, repo_context), timeout=timeout)
        logger.info(
            "agent=%s attempt=%d status=ok duration=%.2fs findings=%d",
            name, attempt, time.monotonic() - start, len(findings),
        )
        return findings
    except asyncio.TimeoutError:
        logger.warning(
            "agent=%s attempt=%d status=timeout duration=%.2fs timeout=%.0fs",
            name, attempt, time.monotonic() - start, timeout,
        )
        return None
    except Exception:
        logger.exception(
            "agent=%s attempt=%d status=error duration=%.2fs", name, attempt, time.monotonic() - start
        )
        return None


async def _run_one(
    name: str, fn: AgentFn, diff: str, repo_context: str, timeout: float, retries: int
) -> list[dict[str, Any]]:
    """Run an agent, retrying up to `retries` times on timeout/exception before
    giving up and excluding it from the merged findings."""
    for attempt in range(1, retries + 2):
        findings = await _run_attempt(name, fn, diff, repo_context, timeout, attempt)
        if findings is not None:
            return findings
        if attempt <= retries:
            logger.info("agent=%s retrying (attempt %d/%d)", name, attempt + 1, retries + 1)
    return []


@traceable(name="orchestrator")
async def run_all_agents(
    diff: str,
    repo_context: str = "",
    agents: dict[str, AgentFn] | None = None,
    timeout_seconds: float | None = None,
    retries: int | None = None,
) -> list[dict[str, Any]]:
    """Fan out to specialist agents in parallel and return merged, ranked findings.

    `agents` defaults to the built-in security/performance/style set but can be
    overridden (e.g. in evals, or to add a new specialist) without touching this
    module. Each agent gets `timeout_seconds` (defaults to
    settings.agent_timeout_seconds) and, on timeout or an unhandled exception, is
    retried up to `retries` times (defaults to settings.agent_retry_attempts)
    before being logged and excluded so it never blocks the others or the overall
    review.
    """
    agents = agents if agents is not None else {
        "security": run_security_agent,
        "performance": run_performance_agent,
        "style": run_style_agent,
    }
    timeout = timeout_seconds if timeout_seconds is not None else settings.agent_timeout_seconds
    retry_count = retries if retries is not None else settings.agent_retry_attempts

    results = await asyncio.gather(
        *(_run_one(name, fn, diff, repo_context, timeout, retry_count) for name, fn in agents.items())
    )
    all_findings: list[dict[str, Any]] = [f for findings in results for f in findings]
    return rank_findings(deduplicate_findings(all_findings))
