"""Request/response schemas for the ingestion service."""

from typing import List, Optional

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    service: str
    embeddingModel: str
    mongoCollection: str
    vectorBackend: str = "qdrant"
    ocrEnabled: bool


class IngestTaxonomy(BaseModel):
    """Jurisdiction taxonomy attached to every chunk for country-scoped retrieval."""

    country: str = Field(..., description="ISO-3166 alpha-2 ('cm', 'ae') or 'global'")
    jurisdiction: str = Field("national", description="national | regional | international")
    docType: str = Field(
        "policy",
        description="law | strategy | regulation | policy | treaty | standard | guidance",
    )
    pillar: Optional[List[str]] = Field(None, description="AI-readiness dimensions informed")
    namespace: Optional[str] = Field(None, description="Optional sub-corpus partition")
    version: Optional[str] = Field(None, description="Source version / revision tag")


class TextIngestRequest(IngestTaxonomy):
    text: str = Field(..., description="Raw document text")
    filename: str = Field(..., description="Document name (grouping key)")
    organizationId: Optional[str] = None
    sourceUrl: Optional[str] = None
    isActive: bool = True


class IngestResultResponse(BaseModel):
    success: bool
    filename: Optional[str] = None
    country: Optional[str] = None
    docType: Optional[str] = None
    chunksProcessed: int
    chunksInserted: int
    chunksSkipped: int = 0
    usedOcr: bool = False


class ErrorDetailResponse(BaseModel):
    detail: str
