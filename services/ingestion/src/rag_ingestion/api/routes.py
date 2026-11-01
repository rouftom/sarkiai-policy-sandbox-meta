"""HTTP routes for the ingestion service."""

import os
import tempfile
from typing import Optional

import fitz  # PyMuPDF
import httpx
from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile

from rag_ingestion.config import settings, resolved_embedding_backend, resolved_vector_backend
from rag_ingestion.api.schemas import (
    HealthResponse,
    IngestResultResponse,
    TextIngestRequest,
)
from rag_ingestion.services.chunker import StructureAwareChunker
from rag_ingestion.services.embeddings import EmbeddingService, VoyageEmbeddingService
from rag_ingestion.services.mongo_store import MongoPolicyStore
from rag_ingestion.services.qdrant_store import QdrantPolicyStore
from rag_ingestion.rights import is_publishable_rights, normalize_rights, refusal_detail

router = APIRouter()


def _authorize(api_key: Optional[str]) -> None:
    if settings.service_api_key and api_key != settings.service_api_key:
        raise HTTPException(status_code=401, detail="Invalid service API key.")


def _extract_pdf_text(path: str) -> str:
    """Extract text page-by-page; returns '' when the PDF is scanned/image-only."""
    parts: list[str] = []
    with fitz.open(path) as doc:
        for page in doc:
            parts.append(page.get_text("text"))
    return "\n".join(parts)


def _run_ocr(path: str) -> str:
    """Send a scanned PDF to the OCR service and return extracted text."""
    if not settings.ocr_url:
        return ""
    try:
        with open(path, "rb") as handle:
            response = httpx.post(
                f"{settings.ocr_url.rstrip('/')}/v1/ocr/pdf",
                files={"file": (os.path.basename(path), handle, "application/pdf")},
                headers={"X-API-Key": settings.service_api_key},
                timeout=120.0,
            )
        response.raise_for_status()
        return response.json().get("text", "")
    except Exception as exc:  # noqa: BLE001
        print(f"[ingestion] OCR fallback failed: {exc}")
        return ""


def _ingest_text(
    *,
    text: str,
    filename: str,
    country: str,
    jurisdiction: str,
    doc_type: str,
    rights: Optional[str] = None,
    pillar=None,
    namespace=None,
    version=None,
    organization_id=None,
    source_url=None,
    is_active=True,
    used_ocr=False,
) -> IngestResultResponse:
    if not is_publishable_rights(rights):
        raise HTTPException(status_code=403, detail=refusal_detail(rights, filename))
    if not text or not text.strip():
        raise HTTPException(status_code=422, detail="No extractable text in document.")

    chunker = StructureAwareChunker(settings.default_chunk_size, settings.default_chunk_overlap)
    candidates = chunker.split(text)
    if not candidates:
        raise HTTPException(status_code=422, detail="Chunker produced no chunks.")

    chunks = [candidate.to_dict(i) for i, candidate in enumerate(candidates)]

    embedder = VoyageEmbeddingService() if resolved_embedding_backend() == "voyage" else EmbeddingService()
    embeddings = embedder.embed_documents([c["text"] for c in chunks])

    store = MongoPolicyStore() if resolved_vector_backend() == "atlas" else QdrantPolicyStore()
    store.ensure_collection()
    result = store.upsert_chunks(
        chunks,
        embeddings,
        country=country,
        jurisdiction=jurisdiction,
        doc_type=doc_type,
        rights=normalize_rights(rights),
        filename=filename,
        is_active=is_active,
        namespace=namespace,
        organization_id=organization_id,
        source_url=source_url,
        pillar=pillar,
        version=version,
    )

    return IngestResultResponse(
        success=True,
        filename=filename,
        country=country,
        docType=doc_type,
        chunksProcessed=len(chunks),
        chunksInserted=result["inserted"],
        chunksSkipped=result["skipped"],
        usedOcr=used_ocr,
    )


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    embedding_model = (
        settings.voyage_embedding_model
        if resolved_embedding_backend() == "voyage"
        else settings.embedding_model
    )
    return HealthResponse(
        status="ok",
        service="sps-ingestion",
        embeddingModel=embedding_model,
        mongoCollection=settings.mongodb_collection,
        vectorBackend=resolved_vector_backend(),
        ocrEnabled=bool(settings.ocr_url),
    )


@router.post("/v1/ingest/text", response_model=IngestResultResponse)
def ingest_text(
    payload: TextIngestRequest,
    x_api_key: Optional[str] = Header(default=None),
) -> IngestResultResponse:
    _authorize(x_api_key)
    return _ingest_text(
        text=payload.text,
        filename=payload.filename,
        country=payload.country,
        jurisdiction=payload.jurisdiction,
        doc_type=payload.docType,
        rights=payload.rights,
        pillar=payload.pillar,
        namespace=payload.namespace,
        version=payload.version,
        organization_id=payload.organizationId,
        source_url=payload.sourceUrl,
        is_active=payload.isActive,
    )


@router.post("/v1/ingest/file", response_model=IngestResultResponse)
async def ingest_file(
    file: UploadFile = File(...),
    country: str = Form(...),
    jurisdiction: str = Form("national"),
    docType: str = Form("policy"),
    rights: Optional[str] = Form(None),
    namespace: Optional[str] = Form(None),
    version: Optional[str] = Form(None),
    sourceUrl: Optional[str] = Form(None),
    x_api_key: Optional[str] = Header(default=None),
) -> IngestResultResponse:
    _authorize(x_api_key)
    if not is_publishable_rights(rights):
        raise HTTPException(status_code=403, detail=refusal_detail(rights, file.filename))

    suffix = os.path.splitext(file.filename or "")[1].lower()
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        if suffix == ".pdf":
            text = _extract_pdf_text(tmp_path)
            used_ocr = False
            if len(text.strip()) < 100 and settings.ocr_url:
                ocr_text = _run_ocr(tmp_path)
                if ocr_text.strip():
                    text = ocr_text
                    used_ocr = True
        else:
            with open(tmp_path, "r", encoding="utf-8", errors="ignore") as handle:
                text = handle.read()
            used_ocr = False
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    return _ingest_text(
        text=text,
        filename=file.filename or "document",
        country=country,
        jurisdiction=jurisdiction,
        doc_type=docType,
        rights=rights,
        namespace=namespace,
        version=version,
        source_url=sourceUrl,
        used_ocr=used_ocr,
    )
