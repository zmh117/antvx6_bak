from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    postgres_user: str = "postgres"
    postgres_password: str = "postgres"
    postgres_db: str = "antvx6"
    postgres_host: str = "localhost"
    postgres_port: int = 5432

    default_graph_id: str = "00000000-0000-0000-0000-000000000001"
    api_prefix: str = "/api"
    jwt_secret: str = "dev-antvx6-change-me"
    jwt_issuer: str = "antvx6"
    jwt_expire_minutes: int = 60 * 24 * 7
    collab_internal_token: str = "dev-collab-internal-token"

    @property
    def database_url(self) -> str:
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
