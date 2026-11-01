"""API surface tests (FastAPI TestClient).

The /health route has no external dependency and always runs. Ingest routes are
exercised with the embedder and the vector store mocked, so no Qdrant/Ollama is
required.
"""

from unittest.mock import patch

from fastapi.testclient import TestClient

from rag_ingestion.main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "sps-ingestion"
    assert body["embeddingModel"]  # e.g. bge-m3


def test_ingest_text_uses_embedder_and_store():
    with patch("rag_ingestion.api.routes.EmbeddingService") as Embedder, patch(
        "rag_ingestion.api.routes.QdrantPolicyStore"
    ) as Store:
        Embedder.return_value.embed_documents.return_value = [[0.0] * 1024]
        Store.return_value.upsert_chunks.return_value = {"inserted": 1, "skipped": 0, "processed": 1}

        response = client.post(
            "/v1/ingest/text",
            json={
                "text": "ARTICLE 1\nDispositions generales.",
                "filename": "test.pdf",
                "country": "cm",
                "docType": "law",
                "rights": "official-text",
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["chunksProcessed"] >= 1
    Store.return_value.upsert_chunks.assert_called_once()
    assert Store.return_value.upsert_chunks.call_args.kwargs["rights"] == "official-text"


def test_ingest_text_refuses_restricted_rights():
    response = client.post(
        "/v1/ingest/text",
        json={
            "text": "ARTICLE 1\nDispositions generales.",
            "filename": "press-article.pdf",
            "country": "cm",
            "docType": "report",
            "rights": "quotation-only",
        },
    )

    assert response.status_code == 403
    assert "quotation-only and to-confirm" in response.json()["detail"]


def test_ingest_text_fails_closed_without_rights():
    response = client.post(
        "/v1/ingest/text",
        json={
            "text": "ARTICLE 1\nDispositions generales.",
            "filename": "unknown.pdf",
            "country": "cm",
            "docType": "policy",
        },
    )

    assert response.status_code == 403
    assert "rights=to-confirm" in response.json()["detail"]
