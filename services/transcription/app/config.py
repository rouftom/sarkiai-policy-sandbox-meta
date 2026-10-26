"""Configuration for the local transcription service (faster-whisper)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    host: str = "0.0.0.0"
    port: int = 8000
    service_api_key: str = ""

    # Local Whisper (faster-whisper / CTranslate2). No cloud transcription.
    whisper_model: str = "large-v3"  # or "small", "medium", "distil-large-v3"
    whisper_device: str = "cpu"  # "cuda" when a GPU is available
    whisper_compute_type: str = "int8"  # "int8" (cpu), "float16" (gpu)
    max_duration_seconds: int = 3600

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
