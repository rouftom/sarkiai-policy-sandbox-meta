# Exigences matérielles de déploiement

Le système est **local-first** (aucun cloud) : la ressource dimensionnante est
**Ollama** (LLM + embeddings). Qdrant, MongoDB, MinIO, l'ingestion, l'API et le
web sont légers. L'OCR, le reranker et la transcription sont **optionnels**
(profils compose).

## 1. Coût des composants

| Composant | Disque | RAM/VRAM à chaud | CPU | Optionnel |
|-----------|--------|------------------|-----|-----------|
| **Ollama: qwen3.5:9b** (Q4, multimodal) | **~6,6 Go** | **~8–10 Go** | oui | non (LLM par défaut) |
| Ollama: qwen2.5:14b (Q4, texte) | ~9 Go | ~11–16 Go | oui | alternative |
| Ollama: qwen2.5:7b (Q4) | ~5 Go | ~6–8 Go | oui | alternative légère |
| **Ollama: bge-m3** (embeddings) | **~1,2 Go** | ~1–2 Go | oui | non |
| Qdrant (KB vectorielle) | < 1 Go (notre échelle) | ~1–2 Go | non | non |
| MongoDB (audit + CoT) | < 1 Go | ~0,5–1 Go | non | non |
| MinIO (pièces jointes image) | ~0,2 Go | ~0,5 Go | non | non |
| ingestion (FastAPI + PyMuPDF + fastembed) | ~0,5 Go | ~1–2 Go | oui | non |
| API (Bun/Fastify) |: | ~0,25–0,5 Go | non | non |
| Web (Next.js) |: | ~0,5–1 Go | non | non |
| OCR (Tesseract) |: | ~1–2 Go | oui (pic) | oui (`ocr`) |
| Reranker TEI (bge-reranker-v2-m3) | ~2,3 Go | ~2–4 Go | oui | oui (profil `rerank`) |
| Transcription (faster-whisper large-v3) | ~3 Go | ~4–6 Go | oui (lent) | oui (profil `media`) |
| Images Docker (ollama, qdrant, mongo, minio, python, node, tei) | ~7–9 Go |: |: |: |

## 2. Profils de déploiement

### A. Minimal (démo économique, CPU)
- **CPU** : 4–8 cœurs · **RAM** : **12–16 Go** · **Disque** : **20–25 Go** SSD · **GPU** : aucun
- `qwen3.5:9b` (6,6 Go) + `bge-m3`, sans rerank ni transcription

### B. Recommandé (démo complète, CPU)
- **CPU** : 8–16 cœurs · **RAM** : **16–32 Go** · **Disque** : **30–40 Go** SSD · **GPU** : aucun
- `qwen3.5:9b` + `bge-m3`, rerank TEI optionnel ; multimodal (texte + image) activé
- Alternative texte : `OLLAMA_MODEL=qwen2.5:14b`

### C. Confortable / production (GPU)
- **GPU NVIDIA** : **12–24 Go VRAM** (RTX 3060 12 Go, 4070 Ti/4080 16 Go, 4090/L4/A10 24 Go)
- **CPU** : 8+ cœurs · **RAM** : **32–64 Go** · **Disque** : **100 Go** NVMe
- `qwen3.5:9b` (ou `qwen3.5:27b` si 32 Go+), inférence rapide, reranker TEI GPU

### Apple Silicon (unified memory)
- **16 Go** : `qwen3.5:9b` confortable
- **32 Go+** : `qwen3.5:27b` confortable

> Référence croisée : le dépôt de référence officiel indique **~16 Go RAM / ~15 Go disque**
> pour `qwen2.5:14b`: notre défaut `qwen3.5:9b` est **plus léger**.

## 3. Détail disque (profil B, premier lancement)

| Poste | Taille |
|-------|--------|
| `qwen3.5:9b` | ~6,6 Go |
| `bge-m3` | ~1,2 Go |
| Images Docker | ~7–9 Go |
| Build cache + corpus CM | ~5–10 Go |
| **Total** | **~20–27 Go** (prévoir 30 Go) |

## 4. Réduire l'empreinte (variables env)

| Objectif | Réglage |
|----------|---------|
| LLM plus léger | `OLLAMA_MODEL=qwen2.5:7b` |
| LLM texte | `OLLAMA_MODEL=qwen2.5:14b` |
| Pas de rerank | ne pas activer le profil `rerank` (`RERANK_URL=` vide) |
| Pas de transcription | ne pas activer le profil `media` |
| Whisper léger | `WHISPER_MODEL=small` |

## 5. Dimensions de readiness concernées

Cette sobriété matérielle est un **argument** : elle alimente **D13 Digital
Infrastructure** (compute/énergie) et **D11 Edge Privacy** (déploiement en
bordure, sans egress), et démontre qu'une solution souveraine peut tourner sans
GPU sur du matériel courant.
