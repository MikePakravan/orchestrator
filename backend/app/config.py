from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = Field(default="dev", alias="APP_ENV")
    allowed_origins: str = Field(default="http://localhost:5173", alias="ALLOWED_ORIGINS")
    task_history_path: Path = Field(default=Path("./data/tasks.json"), alias="TASK_HISTORY_PATH")
    use_mock_agents: bool = Field(default=True, alias="USE_MOCK_AGENTS")

    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    anthropic_api_key: str | None = Field(default=None, alias="ANTHROPIC_API_KEY")

    gemini_model: str = Field(default="gemini-1.5-flash", alias="GEMINI_MODEL")
    openai_model: str = Field(default="gpt-4o-mini", alias="OPENAI_MODEL")
    claude_model: str = Field(default="claude-3-5-sonnet-latest", alias="CLAUDE_MODEL")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

