"""Tesseract OCR helpers for scanned PDFs and images."""

import io
import os
from typing import List

import pytesseract
from pdf2image import convert_from_bytes
from PIL import Image

OCR_LANGUAGES = os.getenv("OCR_LANGUAGES", "fra+eng")


def ocr_image(data: bytes) -> str:
    """OCR a single image and return its text."""
    image = Image.open(io.BytesIO(data))
    return pytesseract.image_to_string(image, lang=OCR_LANGUAGES)


def ocr_pdf(data: bytes) -> str:
    """Rasterize a PDF and OCR every page, joined by form-feed separators."""
    pages: List[str] = convert_from_bytes(data, dpi=300)
    return "\n\f\n".join(pytesseract.image_to_string(page, lang=OCR_LANGUAGES) for page in pages)
