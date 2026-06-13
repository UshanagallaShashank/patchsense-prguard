import json
import os
from typing import Any

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
from langsmith import traceable
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from app.core.config import settings
from app.agents.prompts import SECURITY_SYSTEM_PROMPT

os.environ.setdefault("GOOGLE_API_KEY", settings.gemini_api_key)
_llm = ChatGoogleGenerativeAI(model=settings.gemini_model)


@traceable(name="security_agent")
@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=10), retry=retry_if_exception_type(Exception))
async def run_security_agent(diff: str, repo_context: str = "") -> list[dict[str, Any]]:
    context_line = f"\nRepo context: {repo_context}\n" if repo_context else ""
    content = f"{context_line}PR diff:\n{diff}"
    messages = [SystemMessage(content=SECURITY_SYSTEM_PROMPT), HumanMessage(content=content)]
    response = await _llm.ainvoke(messages)
    if not isinstance(response.content, str):
        return []
    return _parse_findings(response.content, agent="security")


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
