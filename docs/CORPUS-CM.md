# Corpus Cameroun (CM) — collecte et ingestion

Objectif : constituer la base de connaissances nationale **scopée `country=cm`**,
puis la référence mondiale (`country=global`) pour le moteur d'écarts.

## 1. Checklist machine-lisible

- Corpus national : [`data/country/cm/manifest.json`](../data/country/cm/manifest.json)
- Bonnes pratiques mondiales : [`data/global/standards/manifest.json`](../data/global/standards/manifest.json)

Chaque entrée a un `status` :

| `status` | Signification |
|----------|---------------|
| `verified` | instrument public dont le numéro/intitulé est fiable |
| `to_confirm` | **à vérifier avant ingestion** (numéro, version en vigueur, URL officielle) |

> ⚠️ Règle d'or : une erreur factuelle dans la KB se propage aux réponses des
> agents. Ne jamais ingérer un texte marqué `to_confirm` sans confirmation.

## 2. Sources officielles à privilégier

| Émetteur | Rôle |
|----------|------|
| Primature / Présidence | constitution, décrets, textes fondateurs |
| Assemblée Nationale | lois |
| MINPOSTEL | stratégie numérique, télécoms, IA |
| Ministère de la Santé Publique | loi-cadre santé, e-santé |
| ANTIC | cybersécurité, mandats techniques |
| ART | communications électroniques |
| Autorité de protection des données | protection des données |
| SND30 / MINEPAT | stratégie de développement |
| OAPI / UA | propriété intellectuelle, traités régionaux |

## 3. Catégories → dimensions de readiness

| Catégorie (`docType`) | Dimensions principalement informées |
|-----------------------|-------------------------------------|
| `law` | ai_policies, human_interface |
| `strategy` | contextualization, digital_infrastructure |
| `regulation` | ai_policies, human_interface |
| `policy` | cross_domain, ai_integration |
| `treaty` | data_marketplace, human_interface |
| `guidance` / `standard` (global) | toutes — référence d'écart |

## 4. Procédure d'ingestion

```bash
# 1. placer les fichiers (PDF/TXT) dans data/country/cm/
cp /chemin/vers/loi.pdf data/country/cm/

# 2. ingérer (Qdrant + bge-m3 local) — le chunking extrait TITRE/CHAPITRE/ARTICLE
./scripts/seed.sh --country cm --doc-type law --dir data/country/cm

# 3. corpus mondial
./scripts/seed.sh --country global --jurisdiction international --doc-type guidance --dir data/global/standards
```

Le service d'ingestion bascule automatiquement sur l'OCR (`services/ocr`) pour
les PDF scannés (gazettes).

## 5. Contrôle qualité (avant soumission)

1. **Couverture** : chaque dimension de readiness a ≥ 1 disposition nationale et ≥ 1
   référence mondiale.
2. **Récupération** : `POST /v1/agents/ask` sur 5–10 questions de référence →
   les citations pointent le bon article.
3. **Écarts** : `POST /v1/readiness/report` → vérifier que les écarts citent une
   source nationale **et** une bonne pratique mondiale.
4. **Asymétrie** : le scénario santé libère bien les événements par blocs et
   chaque agent ne voit que ce qui le concerne.

## 6. Éthique & légalité

- Vérifier les droits de réutilisation des textes avant toute publication des
  charges utiles (les lois/décrets sont généralement publics).
- Ne pas ingérer de données personnelles (le corpus est réglementaire, pas
  nominatif).
- Citer systématiquement l'émetteur et l'URL d'origine.
