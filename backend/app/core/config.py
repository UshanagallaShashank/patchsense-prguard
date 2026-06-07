from pydantic_settings import BaseSettings


# Loads all configuration from environment variables
class Settings(BaseSettings):
    github_app_id: str
    github_private_key_path: str
    github_webhook_secret: str
    gemini_api_key: str
    langchain_api_key: str
    langchain_project: str = "patchsense-prguard"
    langchain_tracing_v2: str = "true"
    database_url: str
    redis_url: str = "redis://localhost:6379"
    env: str = "development"
    log_level: str = "INFO"

    class Config:
        env_file = ".env"


settings = Settings()
