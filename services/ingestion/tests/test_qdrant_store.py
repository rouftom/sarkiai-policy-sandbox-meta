"""Unit tests for the Qdrant store (no server needed)."""

import uuid

from rag_ingestion.services.qdrant_store import QdrantPolicyStore


def test_point_id_is_deterministic():
    a = QdrantPolicyStore.point_id("cm:health:law:f.pdf:ARTICLE 12 text")
    b = QdrantPolicyStore.point_id("cm:health:law:f.pdf:ARTICLE 12 text")
    assert a == b
    assert a != QdrantPolicyStore.point_id("cm:health:law:f.pdf:ARTICLE 13 text")


def test_point_id_is_a_valid_uuid_string():
    value = QdrantPolicyStore.point_id("anything")
    assert len(value) == 36 and value.count("-") == 4
    # must be parseable as a UUID (Qdrant point ids accept UUIDs)
    assert str(uuid.UUID(value)) == value
