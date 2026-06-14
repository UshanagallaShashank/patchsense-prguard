"""Gemini API key rotation manager.

Reads one or more API keys from config:
  GEMINI_API_KEY=key1               # single key (existing)
  GEMINI_API_KEYS=key1,key2,key3    # multiple keys, tried in order

When a key returns ResourceExhausted (free-tier 429), it is marked exhausted
for the rest of the UTC day and the next available key is used automatically.
All agents call ainvoke_with_rotation() instead of _llm.ainvoke() directly.
"""

import threading
import time
from typing import Any

import structlog
from google.api_core.exceptions import ResourceExhausted
from langchain_google_genai import ChatGoogleGenerativeAI

log = structlog.get_logger()

_EXHAUSTION_TTL = 24 * 60 * 60  # 24 h — free tier resets daily


class GeminiKeyManager:
    def __init__(self, keys: list[str]) -> None:
        if not keys:
            raise ValueError("At least one Gemini API key is required.")
        self._keys = keys
        self._exhausted: dict[str, float] = {}  # key -> unix timestamp of exhaustion
        self._lock = threading.Lock()
        log.info("gemini_key_manager_init", total_keys=len(keys))

    def get_active_key(self) -> str | None:
        """Return the first key that still has quota, or None if all are exhausted."""
        now = time.time()
        with self._lock:
            for key in self._keys:
                exhausted_at = self._exhausted.get(key)
                if exhausted_at is None:
                    return key
                if now - exhausted_at >= _EXHAUSTION_TTL:
                    # Daily quota has reset — make the key available again.
                    del self._exhausted[key]
                    log.info("gemini_key_quota_reset", key_suffix=key[-6:])
                    return key
        return None

    def mark_exhausted(self, key: str) -> None:
        with self._lock:
            self._exhausted[key] = time.time()
        log.warning(
            "gemini_key_exhausted",
            key_suffix=key[-6:],
            remaining=self.available_count,
            total=len(self._keys),
        )

    @property
    def available_count(self) -> int:
        now = time.time()
        with self._lock:
            return sum(
                1 for k in self._keys
                if k not in self._exhausted or now - self._exhausted[k] >= _EXHAUSTION_TTL
            )

    def status(self) -> list[dict[str, Any]]:
        now = time.time()
        with self._lock:
            result = []
            for k in self._keys:
                exhausted_at = self._exhausted.get(k)
                if exhausted_at and now - exhausted_at < _EXHAUSTION_TTL:
                    resets_in = int(_EXHAUSTION_TTL - (now - exhausted_at))
                    result.append({"key_suffix": k[-6:], "state": "exhausted", "resets_in_seconds": resets_in})
                else:
                    result.append({"key_suffix": k[-6:], "state": "available"})
            return result


def _load_key_manager() -> GeminiKeyManager:
    from app.core.config import settings

    # Support GEMINI_API_KEYS (comma-separated) or fall back to GEMINI_API_KEY.
    import os
    multi = os.environ.get("GEMINI_API_KEYS", "")
    if multi:
        keys = [k.strip() for k in multi.split(",") if k.strip()]
    else:
        keys = [settings.gemini_api_key] if settings.gemini_api_key else []

    return GeminiKeyManager(keys)


# Module-level singleton — created once on first import.
_manager: GeminiKeyManager | None = None
_manager_lock = threading.Lock()


def get_key_manager() -> GeminiKeyManager:
    global _manager
    if _manager is None:
        with _manager_lock:
            if _manager is None:
                _manager = _load_key_manager()
    return _manager


async def ainvoke_with_rotation(messages: list, model: str) -> Any:
    """Call Gemini, rotating to the next API key on ResourceExhausted.

    Tries every available key in sequence. Raises ResourceExhausted only
    when every key is exhausted for the day.
    """
    manager = get_key_manager()

    for attempt in range(len(manager._keys) + 1):
        key = manager.get_active_key()
        if not key:
            raise ResourceExhausted(
                f"All {len(manager._keys)} Gemini API key(s) are exhausted for today. "
                "Add more keys via GEMINI_API_KEYS or enable billing at aistudio.google.com."
            )
        try:
            llm = ChatGoogleGenerativeAI(model=model, google_api_key=key)
            response = await llm.ainvoke(messages)
            if attempt > 0:
                log.info("gemini_key_rotation_success", attempt=attempt, key_suffix=key[-6:])
            return response
        except ResourceExhausted:
            manager.mark_exhausted(key)
            # Loop immediately to try the next key — no sleep needed.
            continue

    raise ResourceExhausted("All Gemini API keys exhausted.")
