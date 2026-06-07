from typing import Any

SEVERITY_RANK = {"critical": 0, "high": 1, "medium": 2, "info": 3}


# Removes findings that share the same file, line, and message across agents
def deduplicate_findings(findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple] = set()
    unique = []
    for f in findings:
        key = (f.get("file_path"), f.get("line_number"), f.get("message"))
        if key not in seen:
            seen.add(key)
            unique.append(f)
    return unique


# Sorts findings by severity from critical to info
def rank_findings(findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(findings, key=lambda f: SEVERITY_RANK.get(f.get("severity", "info"), 3))
