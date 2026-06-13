import hashlib
import hmac

from app.core.config import settings


def verify_webhook_signature(payload: bytes, signature_header: str, secret: str | None = None) -> bool:
    """Verify GitHub's HMAC-SHA256 webhook signature.

    Uses `secret` when provided (per-repo secret stored in DB), otherwise
    falls back to the global GITHUB_WEBHOOK_SECRET env var.
    """
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    key = (secret or settings.github_webhook_secret).encode()
    expected = hmac.new(key, payload, hashlib.sha256).hexdigest()
    received = signature_header.removeprefix("sha256=")
    return hmac.compare_digest(expected, received)
