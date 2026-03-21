from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Database
    database_url: str  # Must use postgresql+asyncpg:// scheme

    # Auth
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30

    # Node auth — static Bearer token nodes authenticate with
    server_token: str

    # OpenAI
    openai_api_key: str

    # DB pool (configurable for tuning)
    db_pool_size: int = 10
    db_max_overflow: int = 20

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    @property
    def valid_tokens(self) -> frozenset[str]:
        """Parse comma-separated SERVER_TOKEN into a set of valid tokens.

        Supports token rotation: SERVER_TOKEN="new_token,old_token" accepts both
        during grace period. Remove old token to revoke: SERVER_TOKEN="new_token".
        """
        return frozenset(t.strip() for t in self.server_token.split(",") if t.strip())

    @field_validator("database_url")
    @classmethod
    def validate_db_url(cls, v: str) -> str:
        if not v.startswith("postgresql+asyncpg://"):
            raise ValueError(
                "database_url must use postgresql+asyncpg:// scheme, not postgresql://"
            )
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()
