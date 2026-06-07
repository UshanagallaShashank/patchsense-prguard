import time
from typing import Any

import httpx

from app.core.github_jwt import generate_app_jwt

GITHUB_API = "https://api.github.com"
_token_cache: dict[int, dict[str, Any]] = {}


# Exchanges App JWT for a short-lived installation access token (cached)
def get_installation_token(installation_id: int) -> str:
    cached = _token_cache.get(installation_id)
    if cached and cached["expires_at"] - 300 > time.time():
        return cached["token"]
    token = _fetch_installation_token(installation_id)
    _token_cache[installation_id] = token
    return token["token"]


# Calls GitHub API to generate an installation token
def _fetch_installation_token(installation_id: int) -> dict[str, Any]:
    app_jwt = generate_app_jwt()
    url = f"{GITHUB_API}/app/installations/{installation_id}/access_tokens"
    response = httpx.post(url, headers={"Authorization": f"Bearer {app_jwt}", "Accept": "application/vnd.github+json"})
    response.raise_for_status()
    data = response.json()
    from datetime import datetime
    expires_at = datetime.fromisoformat(data["expires_at"].replace("Z", "+00:00")).timestamp()
    return {"token": data["token"], "expires_at": expires_at}
