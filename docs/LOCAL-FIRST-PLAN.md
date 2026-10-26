# Plan « Local-first » (souveraineté D10/D11) — VALIDÉ & IMPLÉMENTÉ

> Décisions verrouillées : LLM **qwen3.5:9b** (multimodal texte+image, 6,6 Go) · embeddings
> **bge-m3** (1024-dim, multilingue FR) · reranker **TEI local** ·
> transcription **faster-whisper locale** · **suppression totale** des providers
> cloud · fine-tuning **unsloth** (documenté).
>
> ✅ Implémenté : provider local, embeddings locaux, service `ollama`, reranker
> TEI optionnel, transcription locale, purge cloud, docs.

## 1. Principe

Tout le raisonnement, les embeddings et la transcription s'exécutent **en local**
(Ollama / modèles open-weight). **Aucune donnée ne quitte l'infrastructure** →
alignement direct avec les signaux de readiness **`d10_m10` Data Sovereignty** (D10) et
**`d11_m06` Edge Privacy** (D11), et fonctionnement offline dans la sandbox verrouillée.

## 2. Inventaire des dépendances cloud à retirer

| Emplacement | Dépendance actuelle | Remplacement local |
|-------------|---------------------|--------------------|
| `packages/agents/src/model.ts` | `@ai-sdk/deepseek` + providers deepseek/groq/openai/anthropic/google | `@ai-sdk/openai-compatible` → Ollama `/v1` |
| `packages/agents/package.json` | `@ai-sdk/deepseek` | `@ai-sdk/openai-compatible` |
| `apps/api/package.json` | `@ai-sdk/deepseek` | (retiré) |
| `packages/retrieval/src/index.ts` | Voyage embed + Voyage rerank (`api.voyageai.com`) | Ollama `/v1/embeddings` (bge-m3) + RRF (rerank local optionnel) |
| `services/ingestion/.../embeddings.py` | `voyageai` SDK | client Ollama HTTP (bge-m3) |
| `services/ingestion/requirements.txt` / `pyproject.toml` | `voyageai` | (retiré) ; `httpx` déjà présent |
| `services/transcription/app/*` | Groq Whisper API | **faster-whisper** local (CTranslate2) |
| `apps/api/src/config.ts` | `VOYAGE_API_KEY`, `DEEPSEEK_API_KEY`, `DEFAULT_LLM_PROVIDER` | `OLLAMA_*`, `EMBEDDING_*` |
| `apps/api/src/engine.ts` | `voyageApiKey` | config Ollama |
| `docker-compose.yml` (+ sandbox) | env Voyage/DeepSeek/Groq | service `ollama` + env Ollama |
| `.env.example` (+ sandbox) | clés cloud | variables Ollama locales |
| Docs | mentions Voyage/DeepSeek | mises à jour |

## 3. Architecture locale cible

```
                    ┌──────────────────────────┐
   browser ────────▶│  apps/web (Next.js)      │
                    └────────────┬─────────────┘
                                 │ REST + SSE
                    ┌────────────▼─────────────┐
                    │  apps/api (Fastify)      │
                    └───┬───────────┬──────────┘
                        │           │
        Qdrant (vecteurs)│           │ Mongo (audit/CoT)
                        │           │
              ┌─────────▼───┐   ┌───▼───────────────┐
              │  Ollama     │   │ services/ingestion │
              │  • qwen3.5  │◀──│  embeddings bge-m3 │
              │  • bge-m3   │   └───────────────────┘
              └─────────────┘   ┌───────────────────┐
                                │ services/ocr (loc.)│
                                └───────────────────┘
                                ┌───────────────────┐
                                │ transcription      │
                                │ faster-whisper loc.│
                                └───────────────────┘
   (optionnel) TEI reranker bge-reranker-v2-m3 — profil `rerank`
```

Aucun appel sortant. `ollama` est le **seul** fournisseur de modèles.

## 4. Choix de modèles

| Rôle | Modèle | Justification |
|------|--------|---------------|
| LLM raisonnement | **`qwen3.5:9b`** (Ollama) | multimodal (texte+image) ; 201 langues ; 256K contexte ; ~6,6 Go disque, ~8–10 Go RAM |
| LLM léger (option) | `qwen2.5:7b` via `OLLAMA_MODEL` | portabilité sandbox sans GPU |
| Embeddings | **`bge-m3`** (Ollama) | multilingue (FR excellent), **dense 1024 = notre dimension Qdrant** (aucun changement de schéma) |
| Sparse (hybride) | BM25 (Qdrant, serveur) | inchangé |
| Rerank (option) | `BAAI/bge-reranker-v2-m3` via **TEI** local | remplace Voyage rerank-2 ; sinon RRF brut |
| Transcription (option) | `faster-whisper` (`large-v3` / `small`) | remplace Groq Whisper |

**Bonne surprise** : `bge-m3` est en **1024 dimensions**, exactement la config
Qdrant actuelle → **pas de migration vectorielle**.

## 5. Contexte/env cible

```env
# Modèles locaux (souveraineté — défaut)
LLM_PROVIDER=local
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=qwen3.5:9b
EMBEDDING_PROVIDER=local
EMBEDDING_MODEL=bge-m3
EMBEDDING_DIMENSION=1024
# Rerank local optionnel (TEI)
RERANK_URL=            # ex: http://rerank:80 ; vide => RRF seul
# Transcription locale optionnelle
WHISPER_MODEL=large-v3
```

## 6. Docker

- Nouveau service **`ollama`** (`ollama/ollama`), volume `ollama-data`, GPU NVIDIA optionnel (comme le dépôt de référence).
- Nouvelle cible **`make models`** → `ollama pull qwen3.5:9b` + `ollama pull bge-m3`.
- Service **`rerank`** (TEI) sous profil `rerank` (optionnel).
- `transcription` passe en faster-whisper (profil `media`/`full`).
- `depends_on` : `ingestion` et `api` attendent `ollama` healthy.

## 7. Fine-tuning (documenté, hors implémentation initiale)

Chaîne **100 % locale**, dataset jamais exporté :

1. **Export du dataset** : paires (contexte KB + question → réponse citée) depuis
   Mongo (`cot_traces`, `joint_reports`, sorties readiness).
2. **Entraînement LoRA/QLoRA** : `peft` + `trl` (ou `unsloth`) sur `qwen3.5` open-weight (Apache-2.0).
3. **Conversion** : merge LoRA → `llama.cpp` → **GGUF**.
4. **Déploiement** : `ollama create sps-qwen` puis `OLLAMA_MODEL=sps-qwen`.
5. **Alternative sandbox verrouillée** : entraîner **dans** la sandbox avec les crédits,
   sans sortir le dataset.

Documenté dans `docs/ROADMAP.md` + section README ; pas de code tant que non requis.

## 8. Impact & risques

| Risque | Mitigation |
|--------|-----------|
| RAM ~10 Go (9B) | option `OLLAMA_MODEL=qwen2.5:7b` (env) ; doc prérequis |
| 1er pull ~5-9 Go | `make models` documenté ; volume persistant |
| `generateObject` moins fiable en local | mode JSON Ollama + retry + fallback ; tester |
| Qualité < frontier | acceptable pour la démo ; fine-tuning possible |
| Rerank cloud supprimé | RRF déjà fort ; TEI local optionnel |

## 9. Dimensions de readiness renforcées

- **D10 `d10_m10` Data Sovereignty** : politiques de possession/mouvement des
  données → **coché** (aucun mouvement hors infra).
- **D11 `d11_m06` Edge Privacy** : edge autonome sans fuite → **coché** (inférence locale).
- Surface explicite de ces deux métriques dans le moteur readiness (evidence + score).

## 10. Questions de validation

1. **LLM par défaut** : `qwen3.5:9b` (qualité, 16 Go RAM) — avec `qwen2.5:7b` en option env. OK ?
2. **Embeddings** : `bge-m3` (1024, FR) — confirmé ?
3. **Rerank** : on **supprime** Voyage et on met un **reranker TEI local optionnel** (sinon RRF) — OK, ou RRF seul sans TEI ?
4. **Transcription** : passer à **faster-whisper local** (profil optionnel) — OK ?
5. **Portée** : je retire **tout** cloud (y compris `OPENAI/ANTHROPIC/GOOGLE` des `.env.example`) — confirmé ?
