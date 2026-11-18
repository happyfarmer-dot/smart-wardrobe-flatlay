from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Atelier 2D Flat-Lay Smart Wardrobe API"
    database_url: str = "postgresql+psycopg://atelier:atelier@localhost:5432/atelier_wardrobe"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    recommendation_cache_ttl_hours: int = 24
    allow_cors_origins: list[str] = ["*"]


settings = Settings()
