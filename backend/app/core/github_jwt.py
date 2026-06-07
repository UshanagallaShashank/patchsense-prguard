import time

import jwt

from app.core.config import settings

ALGORITHM = "RS256"
JWT_EXPIRY_SECONDS = 600


# Generates a signed JWT for authenticating as the GitHub App
def generate_app_jwt() -> str:
    now = int(time.time())
    with open(settings.github_private_key_path, "r") as key_file:
        private_key = key_file.read()
    payload = {"iat": now - 60, "exp": now + JWT_EXPIRY_SECONDS, "iss": settings.github_app_id}
    return jwt.encode(payload, private_key, algorithm=ALGORITHM)
