from typing import Any

SEVERITY_RANK = {"critical": 0, "high": 1, "medium": 2, "info": 3}

# Findings below this confidence threshold are dropped before posting.
_MIN_CONFIDENCE = 0.45


def deduplicate_findings(findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Deduplicate by (file_path, line_number, message) exact match first,
    then by (file_path, line_number) keeping the highest-confidence finding
    when two agents flag the same location with different wording."""
    # Pass 1: exact-key dedup, keeping highest confidence per key
    exact: dict[tuple, dict[str, Any]] = {}
    for f in findings:
        key = (f.get("file_path"), f.get("line_number"), f.get("message"))
        existing = exact.get(key)
        if existing is None or f.get("confidence", 0) > existing.get("confidence", 0):
            exact[key] = f

    # Pass 2: location-level dedup — keep highest-severity (then highest-confidence) per location
    location: dict[tuple, dict[str, Any]] = {}
    for f in exact.values():
        loc = (f.get("file_path"), f.get("line_number"))
        existing = location.get(loc)
        if existing is None:
            location[loc] = f
        else:
            existing_rank = SEVERITY_RANK.get(existing.get("severity", "info"), 3)
            new_rank = SEVERITY_RANK.get(f.get("severity", "info"), 3)
            if new_rank < existing_rank or (
                new_rank == existing_rank and f.get("confidence", 0) > existing.get("confidence", 0)
            ):
                location[loc] = f

    # Pass 3: drop low-confidence findings (likely hallucinations)
    return [f for f in location.values() if f.get("confidence", 1.0) >= _MIN_CONFIDENCE]


def rank_findings(findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        findings,
        key=lambda f: (SEVERITY_RANK.get(f.get("severity", "info"), 3), -f.get("confidence", 0)),
    )
