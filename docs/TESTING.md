# Testing

Trois niveaux : **unitaire** (sans infra), **intégration** (infra requise, *gated*),
**e2e** (stack en marche, *gated*). Les tests d'intégration/e2e sont **skippés
automatiquement** si les variables d'environnement ne sont pas définies: ce qui
permet de les versionner sans dépendre d'une machine particulière.

> ⚠️ **Cette machine de développement ne peut pas lancer l'infra** (pas de Docker
> runtime / contraintes matérielles). Seuls les tests **unitaires** y tournent.

## Unitaires (sans infra): exécutables partout

```bash
bun run test          # turbo: bun test dans chaque package (@sps/*)
bun test              # tout (unit + gated, ces derniers skippés)
```

Couverture : `@sps/shared` (taxonomie readiness 6/13, lenses, institutions),
`@sps/scenarios` (release progressif, asymétrie), `@sps/readiness` (scoring 0–5,
composite, graphe causal), `@sps/citations`, `@sps/report`, `@sps/storage`,
`@sps/retrieval` (RRF).

Python (chunker, pur stdlib) :

```bash
cd services/ingestion && PYTHONPATH=src python3 tests/test_chunker.py
```

## Intégration (*gated* par env, infra requise)

TS :

```bash
MONGO_URL=mongodb://localhost:27017 bun run test:int          # audit (chaîne de hachage)
QDRANT_URL=http://localhost:6333 OLLAMA_BASE_URL=http://localhost:11434 \
  bun run test:int                                             # retrieval hybride
```

Python (pydantic/fastapi/qdrant requis: via Docker) :

```bash
cd services/ingestion && PYTHONPATH=src pytest tests/ \
  -k "schemas or embeddings or qdrant_store or api"
```

## e2e (*gated*, stack en marche)

```bash
E2E_BASE_URL=http://localhost:8000 bun run test:e2e
```

Vérifie `/health`, `POST /v1/scenarios/start` (agenda), la libération d'un tick
facilitateur, et `POST /v1/readiness/report` (13 dimensions notées).

## CI recommandée (hors de cette machine)

| Job | Commande | Infra |
|-----|----------|-------|
| unit | `bun run typecheck && bun run test && bun run build` | aucune |
| unit-py | `pytest services/ingestion/tests` | image Doker ingestion |
| integration | `bun run test:int` + `pytest -k integration` | mongo + qdrant + ollama |
| e2e | `docker compose up -d && make models && ./scripts/seed.sh` puis `bun run test:e2e` | stack complète |

## Conventions

- Tests TS : `*.test.ts` (unit), `*.integration.test.ts` (gated).
- Tests Python : `services/<svc>/tests/test_*.py` (pytest).
- Jamais de dépendance réseau/infra dans les tests **unitaires**.
