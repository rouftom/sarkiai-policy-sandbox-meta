/** Runtime configuration for the API application layer. */

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

  // Cloud retrieval: Voyage embeddings + MongoDB Atlas Vector/Search.
  // `auto` follows the provider mode (cloud => atlas, sovereign/local => qdrant).
  retrieval: {
    backend: env('RETRIEVAL_BACKEND', 'auto'),
    voyage: {
      apiKey: env('VOYAGE_API_KEY'),
      baseUrl: env('VOYAGE_API_URL', 'https://api.voyageai.com/v1'),
      embeddingModel: env('VOYAGE_EMBEDDING_MODEL', 'voyage-4'),
      rerankModel: env('VOYAGE_RERANK_MODEL', 'rerank-2'),
      dimensions: Number(env('EMBEDDING_DIMENSION', '1024')) || 1024,
    },
    atlas: {
      collection: env('MONGODB_RAG_COLLECTION', 'kb_chunks'),
      vectorIndex: env('MONGODB_VECTOR_INDEX', 'sps_vector_index'),
      textIndex: env('MONGODB_TEXT_INDEX', 'sps_text_index'),
      autoIndexes: env('MONGODB_AUTO_INDEXES', 'true') !== 'false',
    },
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

  // Local faster-whisper service, used when the provider is not `cloud`.
  transcription: {
    url: env('TRANSCRIPTION_URL', 'http://localhost:8003'),
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

  // WhatsApp Cloud API, called directly from the API (no external gateway).
  // Cloud API is the only channel; approval decisions stay inside the web app.
  whatsapp: {
    version: env('WHATSAPP_VERSION', 'v26.0'),
    phoneNumberId: env('WHATSAPP_PHONE_NUMBER_ID'),
    accessToken: env('WHATSAPP_ACCESS_TOKEN'),
    verifyToken: env('WHATSAPP_WEBHOOK_VERIFY_TOKEN'),
    appSecret: env('WHATSAPP_APP_SECRET'),
    recipient: env('WHATSAPP_RECIPIENT_WAID'),
    templateLanguage: env('WHATSAPP_TEMPLATE_LANGUAGE', 'en'),
    apiBaseUrl: env('WHATSAPP_API_URL', 'https://graph.facebook.com'),
    approvalSecret: env('APPROVAL_SECRET'),
    webPublicUrl: env('WEB_PUBLIC_URL', 'http://localhost:3000'),
  },

  // Operator auth: session signing + the bootstrap operator.
  auth: {
    sessionSecret: env('SESSION_SECRET') || env('APPROVAL_SECRET'),
    email: env('SPS_OPERATOR_EMAIL', 'rouftomb@gmail.com'),
    password: env('SPS_OPERATOR_PASSWORD'),
    name: env('SPS_OPERATOR_NAME', 'Policy operator'),
  },
} as const
