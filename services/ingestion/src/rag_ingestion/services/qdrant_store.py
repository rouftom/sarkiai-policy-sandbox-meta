"""Qdrant vector store for policy chunks.

Collection layout:
  • dense  · named dense vector (local bge-m3, 1024-d, cosine)
  • text   · named sparse vector (BM25, IDF modifier) for hybrid search

Each point payload carries the full jurisdiction taxonomy plus the structural
breadcrumbs (headingPath, articleNumber, ...). Points are keyed by a
deterministic UUID derived from the content hash, so re-ingestion is idempotent.
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from qdrant_client import QdrantClient, models

from rag_ingestion.config import settings

_NAMESPACE = uuid.UUID("6f9619ff-8b86-d011-b42d-00c04fc964ff")


class QdrantPolicyStore:
    """Persists policy chunks in Qdrant with dense + sparse (hybrid) vectors."""

    def __init__(self, url: str = None, api_key: str = None, collection: str = None):
        self.url = url or settings.qdrant_url
        self.api_key = api_key if api_key is not None else settings.qdrant_api_key
        self.collection = collection or settings.qdrant_collection
        self._client: Optional[QdrantClient] = None

    @property
    def client(self) -> QdrantClient:
        if self._client is None:
            self._client = QdrantClient(url=self.url, api_key=self.api_key or None)
        return self._client

    def ensure_collection(self) -> None:
        """Create the collection and payload indexes idempotently."""
        try:
            if not self.client.collection_exists(self.collection):
                self.client.create_collection(
                    collection_name=self.collection,
                    vectors_config={
                        settings.qdrant_dense_vector_name: models.VectorParams(
                            size=settings.embedding_dimension,
                            distance=models.Distance.COSINE,
                        )
                    },
                    sparse_vectors_config={
                        settings.qdrant_sparse_vector_name: models.SparseVectorParams(
                            modifier=models.Modifier.IDF,
                        )
                    },
                )
            # Payload indexes used by the retriever filters.
            for field in ("country", "jurisdiction", "docType", "namespace"):
                self.client.create_payload_index(
                    collection_name=self.collection,
                    field_name=field,
                    field_schema=models.PayloadSchemaType.KEYWORD,
                )
            self.client.create_payload_index(
                collection_name=self.collection,
                field_name="isActive",
                field_schema=models.PayloadSchemaType.BOOL,
            )
        except Exception as exc:  # noqa: BLE001
            print(f"[qdrant_store] Collection/index setup failed: {exc}")

    @staticmethod
    def point_id(content_hash: str) -> str:
        return str(uuid.uuid5(_NAMESPACE, content_hash))

    def upsert_chunks(
        self,
        chunks: List[Dict[str, Any]],
        embeddings: List[List[float]],
        *,
        country: str,
        jurisdiction: str,
        doc_type: str,
        filename: str,
        is_active: bool = True,
        namespace: Optional[str] = None,
        organization_id: Optional[str] = None,
        source_url: Optional[str] = None,
        pillar: Optional[List[str]] = None,
        version: Optional[str] = None,
    ) -> Dict[str, int]:
        if not chunks or len(chunks) != len(embeddings):
            raise ValueError("Chunks and embeddings must be equal non-zero length.")

        now = datetime.now(timezone.utc).isoformat()
        points: List[models.PointStruct] = []
        hashes: List[str] = []

        for chunk, embedding in zip(chunks, embeddings):
            text = (chunk.get("text") or "").strip()
            if not text:
                continue

            scope = ":".join(filter(None, [country, jurisdiction, doc_type, filename]))
            content_hash = f"{scope}:{text}"
            point_id = self.point_id(content_hash)
            hashes.append(content_hash)

            meta = dict(chunk.get("metadata") or {})
            if version:
                meta["version"] = version
            if organization_id:
                meta["organizationId"] = organization_id

            payload: Dict[str, Any] = {
                "filename": filename,
                "type": doc_type,
                "docType": doc_type,
                "country": country,
                "jurisdiction": jurisdiction,
                "pillar": pillar or [],
                "namespace": namespace,
                "chunkIndex": chunk.get("chunkIndex"),
                "text": text,
                "sourceUrl": source_url,
                "headingPath": chunk.get("headingPath"),
                "articleNumber": chunk.get("articleNumber"),
                "unitType": chunk.get("unitType"),
                "chunkRole": chunk.get("chunkRole"),
                "parentText": chunk.get("parentText"),
                "childOrdinal": chunk.get("childOrdinal"),
                "subdocumentTitle": chunk.get("subdocumentTitle"),
                "contentHash": content_hash,
                "isActive": is_active,
                "metadata": meta,
                "updatedAt": now,
            }

            vector: Dict[str, Any] = {settings.qdrant_dense_vector_name: embedding}
            # Server-side BM25 inference (fastembed) when available; dense-only otherwise.
            try:
                vector[settings.qdrant_sparse_vector_name] = models.Document(
                    text=text, model=settings.qdrant_sparse_model
                )
            except Exception:  # noqa: BLE001
                pass

            points.append(models.PointStruct(id=point_id, vector=vector, payload=payload))

        if points:
            self.client.upsert(collection_name=self.collection, points=points, wait=True)

        return {"inserted": len(points), "skipped": 0, "processed": len(points)}

    def delete_document(self, filename: str, country: str, doc_type: str) -> None:
        self.client.delete(
            collection_name=self.collection,
            points_selector=models.FilterSelector(
                filter=models.Filter(
                    must=[
                        models.FieldCondition(key="filename", match=models.MatchValue(value=filename)),
                        models.FieldCondition(key="country", match=models.MatchValue(value=country)),
                        models.FieldCondition(key="docType", match=models.MatchValue(value=doc_type)),
                    ]
                )
            ),
        )
