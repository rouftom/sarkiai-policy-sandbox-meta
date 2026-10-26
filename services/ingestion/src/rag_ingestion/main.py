"""FastAPI entrypoint for the ingestion microservice."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from rag_ingestion.api.routes import router
from rag_ingestion.config import settings

app = FastAPI(
    title="SarkiAI Policy Sandbox — Ingestion",
    description="Structure-aware legal/policy ingestion into a country-scoped vector knowledge base.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.on_event("startup")
def bootstrap_collection() -> None:
    """Best-effort creation of the Qdrant collection + payload indexes at boot."""
    try:
        from rag_ingestion.services.qdrant_store import QdrantPolicyStore

        QdrantPolicyStore().ensure_collection()
    except Exception as exc:  # noqa: BLE001
        print(f"[ingestion] Startup Qdrant bootstrap skipped: {exc}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("rag_ingestion.main:app", host=settings.host, port=settings.port)
