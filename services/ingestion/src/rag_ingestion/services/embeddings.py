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


class VoyageEmbeddingService:
    """Cloud embeddings through Voyage AI (default `voyage-4`, 1024-dim).

    Meta has no embedding model, so cloud mode uses Voyage. The service fails
    fast when the key is missing or the provider returns a different number of
    vectors: writing zero vectors would silently poison Atlas.
    """

    def __init__(self, api_key: str = None, base_url: str = None, model: str = None):
        self.api_key = api_key or settings.voyage_api_key
        self.base_url = (base_url or settings.voyage_api_url).rstrip("/")
        self.model = model or settings.voyage_embedding_model

    def _embed(self, texts: List[str], input_type: str) -> List[List[float]]:
        if not texts:
            return []
        if not self.api_key:
            raise RuntimeError("VOYAGE_API_KEY is not configured; cannot generate embeddings.")

        vectors: List[List[float]] = []
        batch_size = settings.voyage_embedding_batch_size
        for start in range(0, len(texts), batch_size):
            window = texts[start : start + batch_size]
            response = httpx.post(
                f"{self.base_url}/embeddings",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "input": window,
                    "model": self.model,
                    "input_type": input_type,
                    "truncation": True,
                },
                timeout=120.0,
            )
            response.raise_for_status()
            rows = response.json().get("data") or []
            if len(rows) != len(window):
                raise RuntimeError(
                    f"Voyage returned {len(rows)} vectors for {len(window)} inputs."
                )
            for row in sorted(rows, key=lambda item: item.get("index", 0)):
                embedding = row.get("embedding") or []
                if not embedding:
                    raise RuntimeError("Voyage returned an empty vector.")
                vectors.append(embedding)
        return vectors

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return self._embed(texts, "document")

    def embed_query(self, text: str) -> List[float]:
        vectors = self._embed([text], "query")
        if not vectors:
            raise RuntimeError("Voyage returned no embedding for the query.")
        return vectors[0]
