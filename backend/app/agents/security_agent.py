import json
import os
from typing import Any

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
from langsmith import traceable

from app.core.config import settings
from app.agents.prompts.security_prompt import SECURITY_SYSTEM_PROMPT

os.environ.setdefault("GOOGLE_API_KEY", settings.gemini_api_key)
_llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash")


# Runs security analysis on a PR diff and returns structured findings
@traceable(name="security_agent")
async def run_security_agent(diff: str) -> list[dict[str, Any]]:
    messages = [SystemMessage(content=SECURITY_SYSTEM_PROMPT), HumanMessage(content=f"PR diff:\n{diff}")]
    response = await _llm.ainvoke(messages)
    if not isinstance(response.content, str):
        return []
    return _parse_findings(response.content, agent="security")


# Extracts JSON findings array from LLM response text
def _parse_findings(content: str, agent: str) -> list[dict[str, Any]]:
    start, end = content.find("["), content.rfind("]") + 1
    if start == -1:
        return []
    findings = json.loads(content[start:end])
    for f in findings:
        f["agent"] = agent
    return findings
