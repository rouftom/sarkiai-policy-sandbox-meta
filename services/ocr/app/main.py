"""FastAPI entrypoint for the OCR microservice."""

import os
from typing import Optional

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.ocr import OCR_LANGUAGES, ocr_image, ocr_pdf

SERVICE_API_KEY = os.getenv("SERVICE_API_KEY", "")

app = FastAPI(title="SarkiAI Policy Sandbox — OCR", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class OCRResponse(BaseModel):
    text: str
    languages: str
    pages: int = 1


def _authorize(api_key: Optional[str]) -> None:
    if SERVICE_API_KEY and api_key != SERVICE_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid service API key.")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "sps-ocr", "languages": OCR_LANGUAGES}


@app.post("/v1/ocr/pdf", response_model=OCRResponse)
async def ocr_pdf_route(file: UploadFile = File(...), x_api_key: Optional[str] = Header(default=None)) -> OCRResponse:
    _authorize(x_api_key)
    data = await file.read()
    text = ocr_pdf(data)
    pages = text.count("\f") + 1 if text else 0
    return OCRResponse(text=text, languages=OCR_LANGUAGES, pages=pages)


@app.post("/v1/ocr/image", response_model=OCRResponse)
async def ocr_image_route(file: UploadFile = File(...), x_api_key: Optional[str] = Header(default=None)) -> OCRResponse:
    _authorize(x_api_key)
    text = ocr_image(await file.read())
    return OCRResponse(text=text, languages=OCR_LANGUAGES)
