import hashlib
import hmac
from unittest.mock import patch

from app.core.hmac_verify import verify_webhook_signature


# Verifies valid signature returns True
def test_valid_signature_passes() -> None:
    secret = "test-secret"
    payload = b'{"action": "opened"}'
    sig = "sha256=" + hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    with patch("app.core.hmac_verify.settings") as mock_settings:
        mock_settings.github_webhook_secret = secret
        assert verify_webhook_signature(payload, sig) is True


# Verifies tampered payload returns False
def test_tampered_payload_fails() -> None:
    secret = "test-secret"
    payload = b'{"action": "opened"}'
    sig = "sha256=" + hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    tampered = b'{"action": "deleted"}'
    with patch("app.core.hmac_verify.settings") as mock_settings:
        mock_settings.github_webhook_secret = secret
        assert verify_webhook_signature(tampered, sig) is False


# Verifies missing signature header returns False
def test_missing_signature_fails() -> None:
    with patch("app.core.hmac_verify.settings") as mock_settings:
        mock_settings.github_webhook_secret = "test-secret"
        assert verify_webhook_signature(b"payload", "") is False
