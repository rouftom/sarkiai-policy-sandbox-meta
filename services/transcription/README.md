# Transcription service (local)

Optional, stateless media → transcript service using **faster-whisper**
(CTranslate2), fully on-premise. No cloud transcription API is used.

| Method | Path | Description |
|--------|------|-------------|
| GET  | `/health` | Liveness + model/device |
| POST | `/v1/transcribe` | Multipart audio/video → `{ text, language, segments }` |

Configuration (env):

| Var | Default | Notes |
|-----|---------|-------|
| `WHISPER_MODEL` | `large-v3` | or `small`/`medium`/`distil-large-v3` for lighter footprint |
| `WHISPER_DEVICE` | `cpu` | `cuda` with a GPU |
| `WHISPER_COMPUTE_TYPE` | `int8` | `float16` on GPU |

The model is downloaded on first use into `HF_HOME=/models` (mount a volume to
persist; ~3 GB for `large-v3`). Enabled behind the `full`/`media` compose
profile. Run standalone with `make transcription`.
