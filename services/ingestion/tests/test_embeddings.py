"""Embedding service tests with a mocked Ollama HTTP endpoint."""

from unittest.mock import MagicMock, patch

from rag_ingestion.services.embeddings import EmbeddingService


def _mock_post(embeddings):
    response = MagicMock()
    response.raise_for_status.return_value = None
    response.json.return_value = {"embeddings": embeddings}
    return response


def test_embed_documents_returns_one_vector_per_input():
    with patch("rag_ingestion.services.embeddings.httpx.post") as post:
        post.return_value = _mock_post([[0.0] * 1024, [1.0] * 1024])
        service = EmbeddingService(base_url="http://ollama:11434", model="bge-m3")
        vectors = service.embed_documents(["a", "b"])
        assert len(vectors) == 2
        assert len(vectors[0]) == 1024


def test_embed_documents_empty_input_short_circuits():
    service = EmbeddingService(base_url="http://ollama:11434", model="bge-m3")
    assert service.embed_documents([]) == []


def test_embed_query_returns_single_vector():
    with patch("rag_ingestion.services.embeddings.httpx.post") as post:
        post.return_value = _mock_post([[0.5] * 1024])
        service = EmbeddingService(base_url="http://ollama:11434", model="bge-m3")
        assert len(service.embed_query("question")) == 1024
