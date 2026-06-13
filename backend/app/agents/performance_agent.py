import json
import os
from typing import Any

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
from langsmith import traceable

from app.core.config import settings
from app.agents.prompts import PERFORMANCE_SYSTEM_PROMPT

os.environ.setdefault("GOOGLE_API_KEY", settings.gemini_api_key)
_llm = ChatGoogleGenerativeAI(model=settings.gemini_model)


@traceable(name="performance_agent")
async def run_performance_agent(diff: str) -> list[dict[str, Any]]:
    messages = [SystemMessage(content=PERFORMANCE_SYSTEM_PROMPT), HumanMessage(content=f"PR diff:\n{diff}")]
    response = await _llm.ainvoke(messages)
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
    return findings
