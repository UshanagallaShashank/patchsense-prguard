from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # GitHub
    github_app_id: str = ""
    github_private_key: str = ""
    github_private_key_path: str = ""
    github_webhook_secret: str
    github_pat: str = ""
    github_owner: str = ""

    # AI
    gemini_api_key: str = ""
    # Comma-separated list of extra API keys for automatic rotation when one hits 429.
    # Example: GEMINI_API_KEYS=key1,key2,key3
    # Falls back to GEMINI_API_KEY when unset.
    gemini_api_keys: str = ""
    gemini_model: str = "gemini-2.5-flash-lite"

    # LangSmith tracing — optional; tracing is disabled when key is empty
    langchain_api_key: str = ""
    langchain_project: str = "patchsense-prguard"
    langchain_tracing_v2: str = "false"

    # Supabase
    supabase_url: str
    supabase_key: str
    supabase_secret_key: str = ""

    # Infrastructure
    database_url: str = ""
    redis_url: str = "redis://localhost:6379"
    render_external_url: str = ""  # injected by Render in production

    # Runtime
    env: str = "development"
    log_level: str = "INFO"
    review_timeout_seconds: int = 120
    # Maximum diff size sent to AI agents (chars). Larger diffs are truncated.
    max_diff_chars: int = 40_000


settings = Settings()
