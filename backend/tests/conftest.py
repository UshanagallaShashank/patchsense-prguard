import os

# Sets minimal env vars so Settings() can be instantiated during tests
os.environ.setdefault("GITHUB_APP_ID", "test-app-id")
os.environ.setdefault("GITHUB_PRIVATE_KEY_PATH", "./tests/fixtures/test-key.pem")
os.environ.setdefault("GITHUB_WEBHOOK_SECRET", "test-secret")
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("LANGCHAIN_API_KEY", "test-ls-key")
os.environ.setdefault("LANGCHAIN_TRACING_V2", "false")
os.environ.setdefault("DATABASE_URL", "postgresql://postgres:password@localhost:5432/patchsense_test")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
