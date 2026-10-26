# Corpus Cameroun (CM)

Base de connaissances nationale (domaine **santé** prioritaire). Noms de fichiers
**normalisés** (ASCII, snake_case) pour une ingestion fiable.

## Présent (copié localement)

| Fichier | Type | OCR ? | Contenu |
|---------|------|-------|---------|
| `loi_2024_protection_donnees_personnelles.pdf` | law | — | Loi protection des données (23 déc. 2024) — **cœur** |
| `actualite_strategie_ia_cameroun.pdf` | report | — | Article presse sur la stratégie IA nationale |
| `plan_strategique_cameroun_numerique_2020.pdf` | strategy | — | Plan stratégique Cameroun Numérique |
| `psnsn_sante_numerique_2026_2030.pdf` | policy | **oui** | Plan Stratégique National de Santé Numérique (114 p.) |
| `compact_national_sante_2023.pdf` | policy | **oui** | Compact national santé / CSU (police partiellement non-unicode) |
| `systeme_de_sante_camerounais.pdf` | report | — | Description du système de santé |
| `resume_snd30.pdf` | strategy | — | Résumé SND30 |
| `snd30_complet_2020_2030.pdf` | strategy | — | SND30 complet (collecté en ligne) |
| `cemac_protection_droits_utilisateurs.pdf` | regulation | — | Directive CEMAC droits des utilisateurs (télécoms) |
| `loi_2010_021_commerce_electronique.pdf` | law | **oui** | Loi n° 2010/021 commerce électronique (14 p. scanné) |
| `art_observatoire_marche_telecom_2016.pdf` | report | — | Observatoire ART marché télécoms 2016 |
| `loi_2010_012_cybersecurite_cybercriminalite.pdf` | law | — | Loi cybersécurité/cybercriminalité 2010/012 |
| `loi_2013_013_communications_electroniques.pdf` | law | — | Loi communications électroniques |
| `strategie_ia_collectivites_territoriales.pdf` | report | — | Papier : adoption IA collectivités territoriales |
| `decret_2023_interconnexion.pdf` | regulation | — | Décret interconnexion/accès réseaux (2023) |
| `art_recueil_textes_2018.pdf` | law | — | Recueil des textes télécoms (ART, 486 p.) |
| `compendium_textes_poste_telecom_tic_2023.pdf` | law | **oui** | Compendium MINPOSTEL 2023 (456 p.) |
| `decret_certification_electronique.pdf` | regulation | **oui** | Décret certification électronique |
| `normes_standards_sr_pf_sante.pdf` | guidance | **oui** | Normes SR/PF (164 p.) |
| `penal_code_2016.pdf` | law | **oui** | Code pénal (139 p.) |
| `cameroon_id_cr_ecosystem_diagnostic.txt` | report | — | Diagnostic ID/état civil (converti docx→txt) |

Les payloads (PDF/TXT) sont **hors git** (`.gitignore`) ; seuls `manifest.json`
et ce README sont versionnés.

## OCR

4 PDF sont **scannés sans couche texte** (`needsOcr: true`). L'ingestion appelle
automatiquement le service `ocr` (Tesseract) quand le texte extrait est
insuffisant. Pour les volumineux (PSNSN 114 p., normes 164 p., code pénal 139 p.)
prévoir le profil `full`/`ocr` et de la patience, ou un OCR hors-ligne en amont.

> L'ingestion ne lit que **PDF/TXT**. Les `.docx`/`.pptx` doivent être convertis
> en `.txt` (ex. `unzip -p X.docx word/document.xml` puis suppression des balises).

## Ingest

```bash
./scripts/seed.sh --country cm --doc-type law      --dir data/country/cm
./scripts/seed.sh --country cm --doc-type strategy --dir data/country/cm
./scripts/seed.sh --country cm --doc-type policy   --dir data/country/cm
./scripts/seed.sh --country cm --doc-type guidance --dir data/country/cm
./scripts/seed.sh --country cm --doc-type report   --dir data/country/cm
```

Ou via l'API par document, pour un `docType` exact :

```bash
curl -X POST "$INGESTION/v1/ingest/file" -H "X-API-Key: $SERVICE_API_KEY" \
  -F file=@data/country/cm/loi_2024_protection_donnees_personnelles.pdf \
  -F country=cm -F jurisdiction=national -F docType=law
```

## Collecte en ligne

Un petit collecteur de documents publics est maintenu **hors du projet** :
`../cm-corpus-tools/` (Python stdlib + fallback curl). Voir son `README.md` pour
le dry-run, les sources officielles et les résultats (SND30 complet, directive
CEMAC récupérés ; recueil ART 66 Mo à récupérer séparément). Maathis :
résumés publics seulement (texte intégral derrière compte gratuit).

## À collecter (voir `manifest.json` → `to_confirm`)

Loi-cadre santé 96/03 · loi cybersécurité 2010/012 · loi communications
électroniques 2010/013 · décret de l'autorité de protection des données ·
mandat ANTIC · stratégie nationale de cybersécurité · **document officiel** de la
stratégie IA (nous n'avons qu'un article de presse) · constitution.
