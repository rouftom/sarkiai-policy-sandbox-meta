"""MongoDB Atlas vector store for policy chunks (cloud mode).

The payload mirrors the local Qdrant collection, so the same `KbChunk` contract
serves both backends. Chunks are embedded with Voyage (`voyage-4`, 1024-d,
dotProduct) by the caller and upserted with a deterministic `_id` derived from
the content hash · re-ingesting a document is idempotent.

Search indexes are created by the API at startup (cloud mode only), not here:
the ingestion service must also work against a local Mongo used for operations.
"""

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pymongo import MongoClient, ReplaceOne
from pymongo.collection import Collection
from pymongo.errors import CollectionInvalid

from rag_ingestion.config import settings

_NAMESPACE = uuid.UUID("6f9619ff-8b86-d011-b42d-00c04fc964ff")


class MongoPolicyStore:
    """Persists policy chunks in MongoDB Atlas (`kb_chunks` by default)."""

    def __init__(self, uri: str = None, db_name: str = None, collection: str = None):
        self.uri = uri or settings.mongodb_uri
        self.db_name = db_name or settings.mongodb_db_name
        self.collection_name = collection or settings.mongodb_collection
        self._client: Optional[MongoClient] = None

    @property
    def collection(self) -> Collection:
        if self._client is None:
            self._client = MongoClient(self.uri)
        return self._client[self.db_name][self.collection_name]

    def ensure_collection(self) -> None:
        """Create the collection before the API's Atlas index bootstrap runs."""
        if self.collection_name in self.collection.database.list_collection_names():
            return
        try:
            self.collection.database.create_collection(self.collection_name)
        except CollectionInvalid:
            pass

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
        operations: List[ReplaceOne] = []
        processed = 0

        for chunk, embedding in zip(chunks, embeddings):
            text = (chunk.get("text") or "").strip()
            if not text:
                continue

            scope = ":".join(filter(None, [country, jurisdiction, doc_type, filename]))
            content_hash = f"{scope}:{text}"
            point_id = self.point_id(content_hash)

            meta = dict(chunk.get("metadata") or {})
            if version:
                meta["version"] = version
            if organization_id:
                meta["organizationId"] = organization_id

            document: Dict[str, Any] = {
                "filename": filename,
                "type": doc_type,
                "docType": doc_type,
                "country": country,
                "jurisdiction": jurisdiction,
                "pillar": pillar or [],
                "namespace": namespace,
                "chunkIndex": chunk.get("chunkIndex"),
                "text": text,
                "embedding": embedding,
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
            operations.append(ReplaceOne({"_id": point_id}, document, upsert=True))
            processed += 1

        if operations:
            self.collection.bulk_write(operations, ordered=False)

        return {"inserted": processed, "skipped": 0, "processed": processed}

    def delete_document(self, filename: str, country: str, doc_type: str) -> None:
        self.collection.delete_many(
            {"filename": filename, "country": country, "docType": doc_type}
        )
