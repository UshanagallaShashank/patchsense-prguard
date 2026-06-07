import time

import jwt

from app.core.config import settings

ALGORITHM = "RS256"
JWT_EXPIRY_SECONDS = 600


def generate_app_jwt() -> str:
    now = int(time.time())
    private_key = _load_private_key()
    payload = {"iat": now - 60, "exp": now + JWT_EXPIRY_SECONDS, "iss": settings.github_app_id}
    return jwt.encode(payload, private_key, algorithm=ALGORITHM)


def _load_private_key() -> str:
    # Prefer inline PEM from env var (no file needed)
    if settings.github_private_key:
        return settings.github_private_key.replace("\\n", "\n")
    if settings.github_private_key_path:
        with open(settings.github_private_key_path, "r") as f:
            return f.read()
    raise ValueError(
        "GitHub App private key not configured. "
        "Set GITHUB_PRIVATE_KEY (PEM content) or GITHUB_PRIVATE_KEY_PATH (file path)."
    )
