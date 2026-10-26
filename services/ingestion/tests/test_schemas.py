"""Validation tests for the ingestion request schemas."""

import pytest
from pydantic import ValidationError

from rag_ingestion.api.schemas import TextIngestRequest


def test_taxonomy_defaults():
    request = TextIngestRequest(text="hello", filename="f.pdf", country="cm")
    assert request.jurisdiction == "national"
    assert request.docType == "policy"
    assert request.isActive is True


def test_country_is_required():
    with pytest.raises(ValidationError):
        TextIngestRequest(text="hello", filename="f.pdf")  # type: ignore[call-arg]


def test_empty_text_is_rejected():
    with pytest.raises(ValidationError):
        TextIngestRequest(text="", filename="f.pdf", country="cm")
