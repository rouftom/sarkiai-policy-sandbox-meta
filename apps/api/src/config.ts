/** Runtime configuration for the API application layer — LOCAL ONLY. */

function env(name: string, fallback = ''): string {
  return process.env[name] ?? fallback
}

export const config = {
  host: env('HOST', '0.0.0.0'),
  port: Number(env('PORT', '8000')),
  serviceApiKey: env('SERVICE_API_KEY'),

  qdrant: {
    url: env('QDRANT_URL', 'http://localhost:6333'),
    apiKey: env('QDRANT_API_KEY'),
    collection: env('QDRANT_COLLECTION', 'policy_chunks'),
  },

  // Operational store only (audit log + chain-of-thought); no vectors.
  mongodb: {
    uri: env('MONGODB_URI', 'mongodb://localhost:27017'),
    dbName: env('MONGODB_DB_NAME', 'policy_sandbox'),
  },

  ingestion: {
    baseUrl: env('INGESTION_URL', 'http://localhost:8001'),
    apiKey: env('SERVICE_API_KEY'),
  },

  // Local LLM (Ollama, OpenAI-compatible). qwen3.5:9b is multimodal (text+image).
  ollama: {
    baseUrl: env('OLLAMA_BASE_URL', 'http://localhost:11434'),
    model: env('OLLAMA_MODEL', 'qwen3.5:9b'),
  },

  // Local embeddings (Ollama).
  embeddings: {
    baseUrl: env('OLLAMA_BASE_URL', 'http://localhost:11434'),
    model: env('EMBEDDING_MODEL', 'bge-m3'),
  },

  // Optional local reranker (TEI). Empty URL => RRF-only.
  rerank: {
    url: env('RERANK_URL'),
    model: env('RERANK_MODEL', 'BAAI/bge-reranker-v2-m3'),
  },

  // Object storage (MinIO / S3) for assistant image attachments.
  s3: {
    endpoint: env('S3_ENDPOINT', 'http://localhost:9000'),
    bucket: env('S3_BUCKET', 'sps-attachments'),
    accessKey: env('S3_ACCESS_KEY', 'sps-minio'),
    secretKey: env('S3_SECRET_KEY', 'sps-minio-secret'),
  },
} as const
