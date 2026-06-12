import os
from typing import Any

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
from langsmith import traceable

from app.core.config import settings

os.environ.setdefault("GOOGLE_API_KEY", settings.gemini_api_key)
_llm = ChatGoogleGenerativeAI(model=settings.gemini_model)

_SYSTEM = """You are a code fix assistant. Given a file's full content and a specific code issue,
produce a minimal unified diff that fixes exactly that issue.

Rules:
- Output ONLY a valid unified diff, nothing else
- Use standard unified diff format (--- a/file, +++ b/file, @@ ... @@)
- Make the smallest possible change that fixes the issue
- Do not reformat unrelated code
- Do not add explanations or markdown fences"""


@traceable(name="fix_agent")
async def generate_fix(
    file_path: str,
    file_content: str,
    finding: dict[str, Any],
) -> str | None:
    prompt = f"""File: {file_path}

Issue ({finding['severity']}): {finding['message']}
Suggestion: {finding.get('suggestion', 'Fix the issue described above')}
Line: {finding.get('line_number', 'unknown')}

Full file content:
```
{file_content}
```

Generate a unified diff that fixes this issue."""

    messages = [SystemMessage(content=_SYSTEM), HumanMessage(content=prompt)]
    response = await _llm.ainvoke(messages)
    if not isinstance(response.content, str):
        return None
    patch = response.content.strip()
    # Strip markdown fences if model adds them anyway
    if patch.startswith("```"):
        lines = patch.splitlines()
        patch = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])
    return patch if patch.startswith("---") or patch.startswith("@@") else None
