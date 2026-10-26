"""FastAPI entrypoint for the transcription microservice — LOCAL ONLY.

Uses `faster-whisper` (CTranslate2) fully on-premise: media never leaves the
infrastructure (data sovereignty and edge privacy). The model
is loaded lazily on first use and cached in the container/HF cache volume.
"""

import os
import tempfile
from functools import lru_cache
from typing import Optional

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.config import settings

app = FastAPI(title="SarkiAI Policy Sandbox — Transcription (local)", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class TranscriptSegment(BaseModel):
    start: float
    end: float
    text: str


class TranscriptResponse(BaseModel):
    text: str
    language: Optional[str] = None
    segments: list[TranscriptSegment] = []


@lru_cache(maxsize=1)
def _model():
    """Lazily load the local Whisper model (cached for the process lifetime)."""
    from faster_whisper import WhisperModel

    return WhisperModel(
        settings.whisper_model,
        device=settings.whisper_device,
        compute_type=settings.whisper_compute_type,
    )


def _authorize(api_key: Optional[str]) -> None:
    if settings.service_api_key and api_key != settings.service_api_key:
        raise HTTPException(status_code=401, detail="Invalid service API key.")


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "sps-transcription",
        "engine": "faster-whisper",
        "model": settings.whisper_model,
        "device": settings.whisper_device,
    }


@app.post("/v1/transcribe", response_model=TranscriptResponse)
async def transcribe(
    file: UploadFile = File(...),
    language: Optional[str] = None,
    x_api_key: Optional[str] = Header(default=None),
) -> TranscriptResponse:
    _authorize(x_api_key)
    data = await file.read()
    if len(data) > 500 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Media too large (max 500 MB).")

    suffix = os.path.splitext(file.filename or "media")[1] or ".bin"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(data)
        tmp_path = tmp.name

    try:
        segments_iter, info = _model().transcribe(tmp_path, language=language, vad_filter=True)
        segments = [
            TranscriptSegment(start=float(s.start), end=float(s.end), text=s.text.strip())
            for s in segments_iter
        ]
        text = " ".join(s.text for s in segments if s.text)
        return TranscriptResponse(text=text, language=getattr(info, "language", None), segments=segments)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
