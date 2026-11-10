# World mode — dossier de specs v0.4 (résumé en français)

*7 novembre 2026. Remplace les v0.1 à v0.3. Les documents du dépôt sont en anglais (règle du dépôt) ; ce fichier est le seul en français.*

## Ce qui change depuis la v0.3
| Sujet | Décision intégrée |
|---|---|
| **Q-17** taxonomie | `Jurisdiction` devient `national \| subnational \| regional \| international`. `subnational` = en dessous du pays (États américains, régions françaises, régions camerounaises) ; `regional` garde son sens actuel (blocs supranationaux). Champ optionnel `subdivision` (ISO 3166-2, ex. `US-CA`) obligatoire pour un document subnational. Un job au niveau pays **exclut** les documents subnationaux par défaut ; il les inclut si le participant porte une région ou si `includeSubnational` est vrai. Touche ≈ 20 fichiers du dépôt (types, schémas zod, retrieval, index Atlas, libellés EN/FR) : ticket T-060, 4 jours (`docs/04` §10, `docs/14` n°10). |
| **Q-02b** exclusion d'un run | Oui : champ `sharing: shared \| excluded` (par défaut `shared`) sur les runs readiness et scénario ; seul le propriétaire peut le changer ; un run exclu disparaît du périmètre partagé et des synthèses des autres opérateurs ; action d'audit `world.run.sharing.changed` (`docs/04` §11, T-061, T-062). |
| **Q-18** encarts | Expliqué ci-dessous. Hypothèse retenue : **V1 = cadrage sur la métropole/le continent + pastilles** ; le mode encarts devient un « Could » après la V1 (T-064). France : 18 régions, départements en option. |
| **Q-19** registre `us`/`fr` | Proposition dans `docs/04` §9 et `data/registry-seeds.example.json` : fuseau = celui du siège du gouvernement (comme le Cameroun avec `Africa/Douala`) ; champs optionnels `timezones[]`, `authorities` par secteur, `adminLevel` ; règle d'activation (manifeste présent, ≥ 80 % des documents critiques présents, droits renseignés, références choisies). **Noms d'autorités à confirmer.** |

## Chiffres
64 tickets, **148 jours** (125 Must, 17 Should, 6 Could) ≈ **30 semaines** à temps plein pour une personne, hors marge de 15–25 %. V1 : 80 jours ; V2 : 37 ; V3 : 19 ; durcissement : 10.

## Rappel des décisions antérieures
Rapports partagés par select (*Mes rapports* par défaut) · pays pilotes États-Unis et France · aucun code sur GitHub avant le 10 novembre · géométries Natural Earth générées et committées (≈ 1 Mo mesuré) · aucune mention des paquets à portée propriétaire ni du harness propriétaire dans ce pack.

## Utilisation
Ce dossier est `docs/world-mode/` du dépôt : `docs/` (documents), `schemas/`,
`data/`, `examples/`, `api/`, `analysis/`, `backlog.csv` et `tools/`. Les chemins
cités dans le pack sont relatifs à ce dossier.

`python tools/validate.py` valide exemples et données (outil de relecture, hors
chaîne d'outils du dépôt, qui reste Bun/TypeScript) ; le contrat TypeScript se
compile avec `npx tsc --noEmit --strict --lib es2022,dom api/worldmap.d.ts`.
