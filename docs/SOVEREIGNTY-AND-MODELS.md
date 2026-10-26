# Souveraineté des données & modèles — analyse

> Réponse à la remarque : « leur repo utilise Ollama pour du fine-tuning,
> probablement un aspect de la souveraineté des données. Quid de notre cas ? »
> **Document d'analyse uniquement — aucune implémentation.**

## 1. Mise au point : Ollama ≠ fine-tuning

Ollama est un **serveur d'inférence local** (serving de modèles open-weight), pas
un outil de fine-tuning. Dans le repo de référence :

| Usage | Techno | Rôle |
|-------|--------|------|
| Raisonnement | `qwen2.5:14b` via **Ollama** | scoring/analyse des 13 dimensions |
| Embeddings | `nomic-embed-text` via **Ollama** | vectorisation de la KB |
| KB | ChromaDB (local) | stockage vectoriel |
| Sessions | SQLite | état/audit |

Tout tourne **hors ligne, sur la machine**. Le fine-tuning sur poids ouverts
(Muse Glimmer, Apache-2.0) est une **capacité distincte**, exécutée sur
l'infrastructure propre de l'institution. La vraie motivation d'Ollama ici est donc la
**souveraineté / souveraineté-données** : aucun appel sortant, aucune donnée
(santé, stratégies nationales, etc.) ne quitte l'infrastructure.

## 2. Pourquoi c'est central pour notre cas

- **Données sensibles** : domaine santé, dossiers patients, signaux inférés.
- **Contexte réglementaire** : protection des données (Cameroun), MINPOSTEL, et
  potentiellement souveraineté nationale.
- **Narratif souveraineté / Afrique** : un système qui fonctionne **sans
  dépendance à des API étrangères** est un argument fort devant un ministère.
- **Sandbox verrouillée** : peut être isolée/air-gapped ; dépendre d'API
  externes peut être bloquant pour un déploiement hospitalier.

## 3. Notre posture actuelle (audit interne)

| Composant | Techno actuelle | Sortie de données ? |
|-----------|-----------------|---------------------|
| Vector store | **Qdrant** (self-hosted) | Non ✅ |
| Ops (audit/CoT) | **MongoDB** (self-hosted) | Non ✅ |
| OCR | **Tesseract** (local) | Non ✅ |
| Chunking / ingestion | **Python local** | Non ✅ |
| **Embeddings** | **VoyageAI** (API US) | **Oui 🔴** |
| **LLM raisonnement** | **DeepSeek/Groq/OpenAI…** (API) | **Oui 🔴** |
| Transcription | Groq Whisper (API) | Oui 🟠 |

**Conclusion** : notre stockage et notre traitement de documents sont déjà
souverains ; **ce sont les modèles (embeddings + LLM) qui font sortir la donnée.**
C'est exactement là que se joue la question.

## 4. Spectre de souveraineté

| Niveau | Modèle | Egress | Qualité | Coût | Ops |
|--------|--------|--------|---------|------|-----|
| 0 | API publique mondiale (DeepSeek/OpenAI/Voyage) | Total | ★★★★★ | Payant/token | Nul |
| 1 | API cloud régionale/UE (Mistral, OVH, Scaleway) | Régional | ★★★★ | Payant | Faible |
| 2 | Open-weights **self-hosted** (Ollama/vLLM) | Aucun | ★★★ | Infra (GPU/RAM) | Moyen |
| 3 | Open-weights **on-premise dédié / air-gapped** | Aucun | ★★★ | Infra | Élevé |
| 4 | **Fine-tuning local** d'open-weights (LoRA/QLoRA) | Aucun | ★★★★ | Infra + temps | Élevé |

## 5. Options envisageables (sans implémentation)

### A. Inférence locale via Ollama (miroir du dépôt de référence)
- LLM : `qwen3.5:9b` (multimodal texte+image), `qwen2.5:14b`, `llama3.1:8b`, `gemma3:12b`, `mistral`.
- Embeddings : `nomic-embed-text`, **`bge-m3`** (multilingue, excellent FR — préférable pour nos corpus FR/EN).
- Pros : egress 0, gratuit, offline, déployable dans la sandbox. Cons : ~16 Go
  RAM, latence, qualité < frontier, opérations.

### B. Serving self-hosted à l'échelle
- **vLLM** / **TGI** / **llama.cpp** pour le débit multi-utilisateurs (GPU).
- Pertinent si la démo gère plusieurs délégués simultanés.

### C. Inférence managée souveraine
- Mistral (FR/UE), OVHcloud AI, Scaleway, ou cloud régional africain.
- Compromis : qualité proche du frontier, egress limité à une juridiction
  « acceptable » — à valider avec le cadre juridique camerounais.

### D. Routage hybride par sensibilité
- Un **policy router** : données sensibles → local ; données ouvertes (bonnes
  pratiques mondiales) → éventuellement cloud.
- Cohérent avec notre moteur : la sensibilité est déjà un attribut de corpus
  (`country`, `docType`) et le classifieur pourrait l'évaluer.

### E. Modèles open-weight (licences permissives)
- Qwen2.5, Llama 3.1/3.3, Mistral, Gemma, **Aya** (multilingue), BGE-M3.
- Embeddings souverains : **bge-m3**, multilingual-e5, nomic — via Ollama ou
  **TEI** (Text Embeddings Inference).

### F. Fine-tuning sans exfiltration
- **LoRA/QLoRA** sur open-weights self-hosted (`unsloth`, `peft`) ; ou via les
  crédits sandbox verrouillée. Le **dataset reste on-premise** ; on ne déplace que les
  poids initiaux (publics) et le modèle adapté.

## 6. Ce qui changerait chez nous (impact, non implémenté)

| Composant | Impact | Ampleur |
|-----------|--------|---------|
| `packages/agents/src/model.ts` | ajouter un provider `local` (Ollama/OpenAI-compatible) | Petit |
| `packages/retrieval` | abstraction embeddings (Voyage → bge-m3 local) | Moyen |
| `services/transcription` | Whisper local (`faster-whisper`) vs API | Moyen |
| Docker | service `ollama` (+ modèles) comme dans le dépôt de référence | Petit |
| **Inchangé** | Qdrant, Mongo, ingestion structure-aware, citations, audit, coordinateur | — |

Notre `model.ts` est déjà une **factory de providers** : le point d'accroche
existe. C'est un atout.

## 7. Recommandation (analyse)

1. **Par défaut souverain** : adopter un provider `local` (Ollama, embeddings
   **bge-m3**) comme mode par défaut pour le domaine santé, avec les providers
   cloud **optionnels** (switch par variable d'environnement).
2. **Router hybride** (option D) pour exploiter le cloud seulement sur les
   contenus non sensibles.
3. **Conserver** Qdrant/Mongo self-hosted (déjà souverains).
4. **Fine-tuning** : LoRA/QLoRA local ou crédits sandbox verrouillée, dataset on-premise.
5. **Narratif jury** : « fonctionne entièrement hors ligne dans la sandbox verrouillée,
   aucune donnée de santé ne quitte l'infrastructure » — argument de souveraineté
   fort, aligné avec les politiques nationales de protection des données.

### Table de décision

| Sensibilité donnée | Cible | Choix |
|--------------------|-------|-------|
| Santé / PII | On-premise / sandbox verrouillée | Local (Ollama), embeddings bge-m3 |
| Bonnes pratiques mondiales (public) | Cloud autorisé | API permise |
| Documents mixtes | Hybride | Router de sensibilité |

**En une phrase** : notre architecture est déjà souveraine sauf aux deux
extrémités (embeddings + LLM) ; le passage à Ollama/bge-m3 est un changement
**localisé** (factory de providers + un service Docker), pas une refonte — et
c'est probablement **le choix le plus aligné** avec les standards internationaux si la sandbox est
isolée.

## 8. Décision appliquée (implémentée)

Choix retenu : **local-first, cloud entièrement retiré.**

| Élément | Décision |
|---------|----------|
| LLM | **`qwen3.5:9b`** via Ollama (multimodal texte+image, 6,6 Go) ; alternatives `qwen2.5:14b`/`qwen2.5:7b` par env |
| Embeddings | **`bge-m3`** (Ollama) — 1024-dim, multilingue FR |
| Rerank | **TEI local** (`BAAI/bge-reranker-v2-m3`), profil compose `rerank` ; sinon RRF |
| Transcription | **faster-whisper** local (profil `full`/`media`) |
| Providers cloud | **supprimés** (DeepSeek, Groq, OpenAI, Anthropic, Google, Voyage) |
| Fine-tuning | **unsloth** (LoRA/QLoRA local) — cf. `docs/ROADMAP.md` |

Bénéfice direct sur les métriques évaluées : **D10 `d10_m10` Data Sovereignty**
et **D11 `d11_m06` Edge Privacy** passent au maximum (aucun mouvement de données
hors infrastructure).
