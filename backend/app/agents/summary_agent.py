import json
import os
from typing import Any

import structlog
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
from langsmith import traceable

from app.core.config import settings
from app.agents.prompts.summary_prompt import SUMMARY_SYSTEM_PROMPT

log = structlog.get_logger()

os.environ.setdefault("GOOGLE_API_KEY", settings.gemini_api_key)
_llm = ChatGoogleGenerativeAI(model=settings.gemini_model)

_WEIGHTS = {"critical": 30, "high": 10, "medium": 3, "low": 1, "info": 1}


def compute_risk_score(findings: list[dict[str, Any]]) -> int:
    return min(100, sum(_WEIGHTS.get(f.get("severity", "info"), 1) for f in findings))


def compute_recommendation(risk_score: int, findings: list[dict[str, Any]]) -> str:
    if any(f.get("severity") == "critical" for f in findings) or risk_score >= 70:
        return "block"
    if risk_score >= 25:
        return "review"
    return "approve"


@traceable(name="summary_agent")
async def run_summary_agent(diff: str, findings: list[dict[str, Any]]) -> str:
    """Return a 2-3 sentence narrative summary of the PR and its findings."""
    compact = json.dumps(
        [{"severity": f.get("severity"), "file_path": f.get("file_path"),
          "line_number": f.get("line_number"), "message": f.get("message")}
         for f in findings],
        separators=(",", ":"),
    )
    prompt_content = f"Findings: {compact}\n\nPR diff (truncated to 4000 chars):\n{diff[:4000]}"
    messages = [SystemMessage(content=SUMMARY_SYSTEM_PROMPT), HumanMessage(content=prompt_content)]
    try:
        response = await _llm.ainvoke(messages)
        if not isinstance(response.content, str):
            return ""
        llm_output = response.content
        json_start, json_end = llm_output.find("{"), llm_output.rfind("}") + 1
        if json_start == -1 or json_end == 0:
            return ""
        return json.loads(llm_output[json_start:json_end]).get("narrative", "")
    except Exception as exc:
        log.warning("summary_agent_failed", error=str(exc))
        return ""
