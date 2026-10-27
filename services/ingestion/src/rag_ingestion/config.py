"""Environment-driven configuration for the ingestion microservice."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Settings loaded from environment variables / .env."""

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    environment: str = "development"
    service_api_key: str = ""

    # Mode: cloud => Voyage + Atlas; local/sovereign => Ollama + Qdrant.
    # Explicit VECTOR_BACKEND / EMBEDDING_BACKEND override the mode.
    sandbox_mode: str = "local"
    vector_backend: str = "auto"
    embedding_backend: str = "auto"

    # Qdrant vector knowledge base
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str = ""
    qdrant_collection: str = "policy_chunks"
    qdrant_dense_vector_name: str = "dense"
    qdrant_sparse_vector_name: str = "text"
    # fastembed model used to build the BM25 sparse vector (hybrid search).
    qdrant_sparse_model: str = "Qdrant/bm25"

    # Local embeddings (Ollama, default bge-m3 — 1024-dim, matches Qdrant config)
    ollama_url: str = "http://localhost:11434"
    embedding_model: str = "bge-m3"
    embedding_dimension: int = 1024
    embedding_batch_size: int = 64

    # Cloud embeddings (Voyage AI, 1024-dim, dotProduct in Atlas)
    voyage_api_key: str = ""
    voyage_api_url: str = "https://api.voyageai.com/v1"
    voyage_embedding_model: str = "voyage-4"
    voyage_embedding_batch_size: int = 128

    # MongoDB Atlas vector store (cloud only; audit uses the API's connection)
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db_name: str = "policy_sandbox"
    mongodb_collection: str = "kb_chunks"

    # Chunking
    default_chunk_size: int = 900
    default_chunk_overlap: int = 120

    # OCR fallback (scanned gazettes).
    ocr_url: str = ""

    # Defaults applied when the caller omits taxonomy fields.
    default_country: str = ""
    default_jurisdiction: str = "national"
    default_doc_type: str = "policy"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()


def _mode() -> str:
    return (settings.sandbox_mode or "local").strip().lower()


def resolved_vector_backend() -> str:
    value = (settings.vector_backend or "auto").strip().lower()
    if value in ("qdrant", "atlas"):
        return value
    return "atlas" if _mode() == "cloud" else "qdrant"


def resolved_embedding_backend() -> str:
    value = (settings.embedding_backend or "auto").strip().lower()
    if value in ("ollama", "voyage"):
        return value
    return "voyage" if _mode() == "cloud" else "ollama"
