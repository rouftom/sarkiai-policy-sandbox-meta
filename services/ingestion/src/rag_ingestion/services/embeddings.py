"""Local embedding service (Ollama, default model `bge-m3`).

No cloud call: embeddings are produced on-premise so the corpus never leaves the
infrastructure (data sovereignty and edge privacy).
"""

from typing import List

import httpx

from rag_ingestion.config import settings


class EmbeddingService:
    """Wraps the local Ollama `/api/embed` endpoint to produce 1024-dim vectors."""

    def __init__(self, base_url: str = None, model: str = None):
        self.base_url = (base_url or settings.ollama_url).rstrip("/")
        self.model = model or settings.embedding_model

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """Embed a batch of chunks. Fails fast on empty output."""
        if not texts:
            return []

        vectors: List[List[float]] = []
        batch = settings.embedding_batch_size
        for start in range(0, len(texts), batch):
            window = texts[start : start + batch]
            response = httpx.post(
                f"{self.base_url}/api/embed",
                json={"model": self.model, "input": window},
                timeout=120.0,
            )
            response.raise_for_status()
            embeddings = response.json().get("embeddings") or []
            if len(embeddings) != len(window):
                raise RuntimeError(
                    f"Local embedder returned {len(embeddings)} vectors for {len(window)} inputs."
                )
            vectors.extend(embeddings)
        return vectors

    def embed_query(self, text: str) -> List[float]:
        """Embed a single retrieval query."""
        vectors = self.embed_documents([text])
        if not vectors:
            raise RuntimeError("Local embedder returned no vector for the query.")
        return vectors[0]
