from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langsmith import traceable

from app.core.config import settings
from app.core.gemini_key_manager import ainvoke_with_rotation

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
    response = await ainvoke_with_rotation(messages, settings.gemini_model)
    if not isinstance(response.content, str):
        return None
    patch = response.content.strip()
    if patch.startswith("```"):
        lines = patch.splitlines()
        patch = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])
    return patch if patch.startswith("---") or patch.startswith("@@") else None
