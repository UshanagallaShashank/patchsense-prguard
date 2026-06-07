import json
from typing import Any

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
from langsmith import traceable

from app.core.config import settings
from app.agents.prompts.style_prompt import STYLE_SYSTEM_PROMPT

_llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash", google_api_key=settings.gemini_api_key)


# Runs style and quality analysis on a PR diff and returns structured findings
@traceable(name="style_agent")
async def run_style_agent(diff: str) -> list[dict[str, Any]]:
    messages = [SystemMessage(content=STYLE_SYSTEM_PROMPT), HumanMessage(content=f"PR diff:\n{diff}")]
    response = await _llm.ainvoke(messages)
    return _parse_findings(response.content, agent="style")


# Extracts JSON findings array from LLM response text
def _parse_findings(content: str, agent: str) -> list[dict[str, Any]]:
    start, end = content.find("["), content.rfind("]") + 1
    if start == -1:
        return []
    findings = json.loads(content[start:end])
    for f in findings:
        f["agent"] = agent
    return findings
