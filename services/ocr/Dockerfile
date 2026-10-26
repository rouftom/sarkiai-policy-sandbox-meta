# Build context: repository root
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Tesseract with French + English language packs, plus poppler for PDF rasterization.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        tesseract-ocr tesseract-ocr-fra tesseract-ocr-eng poppler-utils curl \
    && rm -rf /var/lib/apt/lists/*

COPY services/ocr/requirements.txt ./requirements.txt
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY services/ocr/app ./app

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=15s \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health').status==200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
