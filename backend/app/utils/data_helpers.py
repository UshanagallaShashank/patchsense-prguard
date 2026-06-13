from typing import Any


def validate_input(data: Any) -> bool:
    if data is None:
        return False
    if isinstance(data, (str, list)) and len(data) == 0:
        return False
    return True


def deduplicate(items: list) -> list:
    seen: set = set()
    result = []
    for item in items:
        key = item if not isinstance(item, dict) else str(sorted(item.items()))
        if key not in seen:
            seen.add(key)
            result.append(item)
    return result
