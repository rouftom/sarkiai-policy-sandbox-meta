# Scenarios for the five sectors (draft for review)

Status: draft, not integrated. Each scenario has three events, as the health scenario does. Every title and payload is written in English and in French. Agent ids are the institution ids of the catalogue.

## 1. Three institutions to add

Each sector without a competent institution gets one. The existing legal adviser, data protection authority and coordinator already cover these sectors and are not changed.

| id | Name (EN) | Nom (FR) | Role | Domains | Colour | Can |
|---|---|---|---|---|---|---|
| `education_ministry` | Ministry of Education | Ministère de l'Éducation | institutional | education | `text-orange-500` | retrieve, assess, escalate |
| `public_services_agency` | Public Service Modernisation Agency | Agence de modernisation des services publics | institutional | public_services | `text-lime-600` | retrieve, assess, escalate |
| `agriculture_ministry` | Ministry of Agriculture | Ministère de l'Agriculture | institutional | agriculture | `text-indigo-500` | retrieve, assess, escalate |

Mandates (English, as the existing mandates are written):

- `education_ministry`: *Safeguard learners' rights and continuity of schooling; own the sectoral response for schools and learning platforms within its statutory powers.* Must not: *adjudicate data-protection complaints.*
- `public_services_agency`: *Own the national identity and benefit registers and the continuity of public services; decide on the suspension of benefit payments within its statutory powers.* Must not: *adjudicate data-protection complaints.*
- `agriculture_ministry`: *Own the input-subsidy programmes and the farmer registers; decide on the freezing or resumption of a programme within its statutory powers.* Must not: *adjudicate data-protection complaints.*

Colours: the palette has six classes today. The three new classes need an entry in `apps/web/src/lib/institutions.ts`, for the accent and the ink.

## 2. Scenario coverage after the change

| Sector | Institutions available |
|---|---|
| Health | legal adviser, Ministry of Public Health, data protection authority, cybersecurity agency, coordinator |
| Education | legal adviser, **Ministry of Education**, data protection authority, cybersecurity agency, coordinator |
| Telecom | legal adviser, telecom regulator, data protection authority, cybersecurity agency, coordinator |
| Public services | legal adviser, **Public Service Modernisation Agency**, data protection authority, cybersecurity agency, coordinator |
| Agriculture | legal adviser, **Ministry of Agriculture**, data protection authority, coordinator |

---

## 3. Health: health-data breach in a public hospital (existing, translated)

**Title.** EN: Health-data breach in a public hospital · FR: Fuite de données de santé dans un hôpital public

Agents: `ministry_health`, `data_protection_authority`, `cyber_agency`, `legal_advisor`, `coordinator`.

| Seq | Chunk | Title EN | Title FR | Visible to |
|---|---|---|---|---|
| 1 | 0 | Incident reported | Incident signalé | ministry_health, cyber_agency |
| 2 | 1 | Scope widens | Le périmètre s'élargit | ministry_health, data_protection_authority, cyber_agency |
| 3 | 2 | Regulatory pressure | Pression réglementaire | data_protection_authority, ministry_health, coordinator |

Payloads:

1. EN: *Anomalous access to the national e-health platform is detected. The hospital IT team is investigating but has not yet scoped the incident.* FR: *Un accès anormal à la plateforme nationale de santé électronique est détecté. L'équipe informatique de l'hôpital enquête, sans avoir encore délimité l'incident.*
2. EN: *Patient records may have been exfiltrated to an external host. The controller cannot confirm whether the data are identifiable.* FR: *Des dossiers patients pourraient avoir été exfiltrés vers un hôte externe. Le responsable du traitement ne peut pas confirmer si les données sont identifiables.*
3. EN: *Media report the breach. The data-protection authority faces a notification deadline; the ministry is asked for a public statement.* FR: *Les médias relaient la fuite. L'autorité de protection des données fait face à un délai de notification ; le ministère est sollicité pour une déclaration publique.*

---

## 4. Education: student-data exposure on a national learning platform

**Title.** EN: Student-data exposure on a national learning platform · FR: Exposition de données d'élèves sur une plateforme nationale d'apprentissage

Agents: `education_ministry`, `data_protection_authority`, `cyber_agency`, `legal_advisor`, `coordinator`.

| Seq | Chunk | Title EN | Title FR | Visible to |
|---|---|---|---|---|
| 1 | 0 | Platform anomaly reported | Anomalie signalée sur la plateforme | education_ministry, cyber_agency |
| 2 | 1 | Minors' records exposed | Dossiers de mineurs exposés | data_protection_authority, education_ministry, legal_advisor, cyber_agency |
| 3 | 2 | Parents and media demand answers | Parents et médias exigent des réponses | education_ministry, data_protection_authority, legal_advisor, coordinator |

Payloads:

1. EN: *A school reports that the learning platform shows records of pupils from other schools. The operator has not yet confirmed the cause or the scope.* FR: *Un établissement signale que la plateforme d'apprentissage affiche des dossiers d'élèves d'autres établissements. L'opérateur n'a pas encore confirmé la cause ni l'étendue.*
2. EN: *The operator confirms that records of about 40,000 pupils, with names, dates of birth and assessment results, were reachable for several days. Some pupils are under 13.* FR: *L'opérateur confirme que les dossiers d'environ 40 000 élèves, avec noms, dates de naissance et résultats, ont été accessibles pendant plusieurs jours. Certains élèves ont moins de 13 ans.*
3. EN: *Parents' associations demand notification within 72 hours. A national newspaper publishes the names of two schools. The ministry must decide whether to suspend the platform.* FR: *Des associations de parents exigent une notification sous 72 heures. Un quotidien publie le nom de deux établissements. Le ministère doit décider de suspendre ou non la plateforme.*

---

## 5. Telecom: SIM-swap fraud after a network outage

**Title.** EN: SIM-swap fraud wave after a network outage · FR: Vague de fraudes à la carte SIM après une panne de réseau

Agents: `telecom_regulator`, `cyber_agency`, `data_protection_authority`, `legal_advisor`, `coordinator`.

| Seq | Chunk | Title EN | Title FR | Visible to |
|---|---|---|---|---|
| 1 | 0 | Outage and fraud complaints | Panne et plaintes pour fraude | telecom_regulator, cyber_agency, coordinator |
| 2 | 1 | Weak verification process | Processus de vérification faible | telecom_regulator, cyber_agency, legal_advisor, data_protection_authority |
| 3 | 2 | Customers ask for compensation | Les clients demandent une indemnisation | telecom_regulator, data_protection_authority, legal_advisor, coordinator |

Payloads:

1. EN: *A nationwide outage lasts six hours. Within a day, banks report SIM swaps on accounts of customers who were not affected by the outage.* FR: *Une panne nationale dure six heures. En un jour, des banques signalent des changements de carte SIM sur des comptes de clients qui n'ont pas été touchés par la panne.*
2. EN: *The operator's logs show that the identity check for SIM replacement was bypassed during the outage, and that a lawful-interception interface was reachable from the customer portal.* FR: *Les journaux de l'opérateur montrent que la vérification d'identité pour le remplacement de carte SIM a été contournée pendant la panne, et qu'une interface d'interception légale était accessible depuis le portail client.*
3. EN: *Consumer groups ask for compensation and a public notice. The data-protection authority asks whether the interception interface exposed call metadata.* FR: *Les associations de consommateurs demandent une indemnisation et un avis public. L'APD demande si l'interface d'interception a exposé des métadonnées d'appels.*

---

## 6. Public services: national ID register leak disrupts benefit payments

**Title.** EN: National ID register leak disrupts benefit payments · FR: Fuite du registre national d'identité qui perturbe le paiement des prestations

Agents: `public_services_agency`, `data_protection_authority`, `cyber_agency`, `legal_advisor`, `coordinator`.

| Seq | Chunk | Title EN | Title FR | Visible to |
|---|---|---|---|---|
| 1 | 0 | Unusual register lookups | Consultations inhabituelles du registre | public_services_agency, cyber_agency, coordinator |
| 2 | 1 | Benefit files found exposed | Fichiers de prestations trouvés exposés | public_services_agency, data_protection_authority, legal_advisor, cyber_agency |
| 3 | 2 | Citizens and oversight react | Citoyens et contrôle parlementaire réagissent | public_services_agency, coordinator, legal_advisor, data_protection_authority |

Payloads:

1. EN: *Over three weeks, the national identity register records a spike of lookups at night from a single contractor account.* FR: *Pendant trois semaines, le registre national d'identité enregistre une hausse de consultations la nuit depuis un compte de sous-traitant.*
2. EN: *Files listing beneficiaries and bank details are found on a public file-sharing site. This month's payments are on hold while the agency verifies them.* FR: *Des fichiers listant bénéficiaires et coordonnées bancaires sont trouvés sur un site de partage public. Les paiements du mois sont suspendus le temps de leur vérification.*
3. EN: *Citizens cannot receive their payments. The parliamentary committee asks for a decision: pay manually or not, and how to notify the people affected.* FR: *Des citoyens ne peuvent pas percevoir leurs prestations. La commission parlementaire demande une décision : paiement manuel ou non, et comment informer les personnes concernées.*

---

## 7. Agriculture: fraud on an input-subsidy platform exposes smallholders' data

**Title.** EN: Fraud on an input-subsidy platform exposes smallholders' data · FR: Fraude sur une plateforme de subventions d'intrants et exposition des données des petits exploitants

Agents: `agriculture_ministry`, `data_protection_authority`, `legal_advisor`, `coordinator`.

| Seq | Chunk | Title EN | Title FR | Visible to |
|---|---|---|---|---|
| 1 | 0 | Duplicate registrations | Inscriptions en double | agriculture_ministry, coordinator |
| 2 | 1 | Smallholder data sold to resellers | Données des petits exploitants vendues à des revendeurs | agriculture_ministry, data_protection_authority, legal_advisor |
| 3 | 2 | Who decides on the subsidies? | Qui décide des subventions ? | agriculture_ministry, data_protection_authority, legal_advisor, coordinator |

Payloads:

1. EN: *The input-subsidy platform registers the same farmers several times, and payments are redirected to accounts held by resellers.* FR: *La plateforme de subventions enregistre plusieurs fois les mêmes exploitants, et les paiements sont redirigés vers des comptes de revendeurs.*
2. EN: *The platform's export tool gave resellers the phone numbers and plots of about 12,000 smallholders, who then received unsolicited offers.* FR: *L'outil d'export de la plateforme a donné aux revendeurs les numéros et parcelles d'environ 12 000 petits exploitants, qui ont reçu des offres non sollicitées.*
3. EN: *The ministry asks whether to freeze the programme for the season. The data-protection authority and the coordinator must agree on a joint notice to farmers.* FR: *Le ministère demande s'il faut geler le programme pour la saison. L'APD et le coordinateur doivent s'accorder sur un avis commun aux exploitants.*

---

## 8. Changes the integration implies (for validation)

1. **Bilingual scenario text.** `ScenarioDefinition` titles and event texts become `{ en, fr }`. The engine returns the text in the user's language; the console sends its language with the scenario request.
2. **Scenario choice per sector.** The sector selector of Scenarios offers only the five sectors above, and each one starts its own scenario. Several sectors are played one after another, as agreed.
3. **Institutions.** The three new institutions go into the catalogue, with their colours, and into the assistant's lists and routing. Tests check that each sector has at least one institution per scenario agent.
4. **Scenario sessions.** Sessions stay in memory for this step, as today; persistence, history and resume are part of step 5.
5. **Tests.** Each scenario must reference only institutions of its sector, and each event must have both languages.

---

## 9. Existing table-top exercise on the health scenario (not yet in the five sectors)

The code already holds one exercise built on the health scenario: a 120-minute table-top drill with four timed injects (`health-breach-drill`, linked to the scenario `health-data-breach`). It is kept as it is, and the five new scenarios have no drill yet: each sector's drill can follow once the scenarios are validated.

Drill: EN *Health-data breach table-top drill* · FR *Exercice de table ronde : fuite de données de santé*. Duration: 120 minutes.

| At | Severity | Response window | Title EN | Title FR | Visible to |
|---|---|---|---|---|---|
| 0 min | high | 15 min | Anomalous access | Accès anormal | ministry_health, cyber_agency |
| 20 min | critical | 30 min | Scope widens | Le périmètre s'élargit | ministry_health, cyber_agency, data_protection_authority |
| 45 min | medium | 10 min | Press call | Appel de la presse | ministry_health, coordinator |
| 75 min | high | 20 min | Regulator letter | Courrier du régulateur | ministry_health, data_protection_authority, coordinator |

Injects (EN / FR):

1. **Anomalous access.** EN: *The SIEM flags a service account reading patient records outside working hours. The volume is small but the account is shared.* Expected action: *Open an incident, preserve the logs and page the cyber agency.* FR: *Le SIEM signale un compte de service qui lit des dossiers patients en dehors des heures de travail. Le volume est faible, mais le compte est partagé.* Action attendue : *Ouvrir un incident, conserver les journaux et alerter l'agence de cybersécurité.*
2. **Scope widens.** EN: *A 4 GB transfer to an external host is confirmed. The data may include identifiable patient records.* Expected action: *Assess the notification duty and inform the data-protection authority.* FR: *Un transfert de 4 Go vers un hôte externe est confirmé. Les données peuvent inclure des dossiers patients identifiables.* Action attendue : *Évaluer l'obligation de notification et informer l'autorité de protection des données.*
3. **Press call.** EN: *A journalist asks for a statement and mentions an internal memo.* Expected action: *Route the request to the communication cell and agree one line.* FR: *Un journaliste demande une déclaration et mentionne une note interne.* Action attendue : *Transmettre la demande à la cellule de communication et convenir d'une ligne commune.*
4. **Regulator letter.** EN: *The data-protection authority asks for the facts, the legal basis and the measures taken, with a deadline.* Expected action: *Assign an owner and log the deadline in the incident file.* FR: *L'autorité de protection des données demande les faits, la base juridique et les mesures prises, avec un délai.* Action attendue : *Désigner un responsable et inscrire l'échéance dans le dossier d'incident.*

Note for validation: the drill refers to the health scenario only. Its injects are timed, so it needs the scenario's events to be bilingual too.

