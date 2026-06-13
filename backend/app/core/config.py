from pydantic_settings import BaseSettings, SettingsConfigDict


# Loads all configuration from environment variables
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # GitHub App auth — set either private_key (PEM content) or private_key_path (file)
    github_app_id: str = ""
    github_private_key: str = ""
    github_private_key_path: str = ""
    github_webhook_secret: str
    # GitHub PAT — alternative to App auth for connecting to any repo/org
    github_pat: str = ""
    # Target org/owner; agents use this when no installation_id is available
    github_owner: str = ""
    gemini_api_key: str
    gemini_model: str = "gemini-2.5-flash"
    langchain_api_key: str
    langchain_project: str = "patchsense-prguard"
    langchain_tracing_v2: str = "true"
    supabase_url: str
    supabase_key: str
    supabase_secret_key: str = ""
    database_url: str = ""
    redis_url: str = "redis://localhost:6379"
    render_url: str = "https://patchsense-prguard-t9ze.onrender.com"
    env: str = "development"
    log_level: str = "INFO"
    review_timeout_seconds: int = 120


settings = Settings()
# test1 = settings.github_webhook_secret
