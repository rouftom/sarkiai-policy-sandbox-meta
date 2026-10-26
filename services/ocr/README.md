# OCR service

Tesseract-based OCR for scanned policy gazettes (French + English by default).

| Method | Path | Description |
|--------|------|-------------|
| GET  | `/health` | Liveness + configured languages |
| POST | `/v1/ocr/pdf` | Rasterize + OCR a PDF, returns full text |
| POST | `/v1/ocr/image` | OCR a single image |

The ingestion service calls `/v1/ocr/pdf` automatically when a PDF yields no
extractable text. Run standalone with `make ocr`.
