import json
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langsmith import traceable
from google.api_core.exceptions import ResourceExhausted
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_not_exception_type

from app.core.config import settings
from app.core.gemini_key_manager import ainvoke_with_rotation
from app.agents.prompts import PERFORMANCE_SYSTEM_PROMPT


@traceable(name="performance_agent")
@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10), retry=retry_if_not_exception_type(ResourceExhausted))
async def run_performance_agent(diff: str, repo_context: str = "") -> list[dict[str, Any]]:
    context_line = f"\nRepo context: {repo_context}\n" if repo_context else ""
    content = f"{context_line}PR diff:\n{diff}"
    messages = [SystemMessage(content=PERFORMANCE_SYSTEM_PROMPT), HumanMessage(content=content)]
    response = await ainvoke_with_rotation(messages, settings.gemini_model)
    if not isinstance(response.content, str):
        return []
    return _parse_findings(response.content, agent="performance")


def _parse_findings(content: str, agent: str) -> list[dict[str, Any]]:
    start, end = content.find("["), content.rfind("]") + 1
    if start == -1 or end == 0:
        return []
    try:
        findings = json.loads(content[start:end])
    except json.JSONDecodeError:
        return []
    if not isinstance(findings, list):
        return []
    for f in findings:
        f["agent"] = agent
        if "confidence" not in f:
            f["confidence"] = 0.7
    return findings
