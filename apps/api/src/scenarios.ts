/**
 * Authored scenarios, one per sector, each in English and in French.
 *
 * A scenario's agents are the institutions of its sector. Its events are released
 * in order; each one is visible to the agents named in `visibleTo`, so the agents
 * receive different information (information asymmetry).
 */

import type { ScenarioDefinition } from '@sps/scenarios'
import { institutionsForDomain, type Domain } from '@sps/shared'

export type ScenarioLang = 'en' | 'fr'

interface Localized {
  en: string
  fr: string
}

interface AuthoredEvent {
  sequence: number
  releaseChunk: number
  title: Localized
  payload: Localized
  visibleTo: string[]
}

interface AuthoredScenario {
  id: string
  domain: Domain
  title: Localized
  events: AuthoredEvent[]
}

const AUTHORED: AuthoredScenario[] = [
  {
    id: 'health-data-breach',
    domain: 'health',
    title: {
      en: 'Health-data breach in a public hospital',
      fr: 'Fuite de données de santé dans un hôpital public',
    },
    events: [
      {
        sequence: 1,
        releaseChunk: 0,
        title: { en: 'Incident reported', fr: 'Incident signalé' },
        payload: {
          en: 'Anomalous access to the national e-health platform is detected. The hospital IT team is investigating but has not yet scoped the incident.',
          fr: "Un accès anormal à la plateforme nationale de santé électronique est détecté. L'équipe informatique de l'hôpital enquête, sans avoir encore délimité l'incident.",
        },
        visibleTo: ['ministry_health', 'cyber_agency'],
      },
      {
        sequence: 2,
        releaseChunk: 1,
        title: { en: 'Scope widens', fr: 'Le périmètre s’élargit' },
        payload: {
          en: 'Patient records may have been exfiltrated to an external host. The controller cannot confirm whether the data are identifiable.',
          fr: 'Des dossiers patients pourraient avoir été exfiltrés vers un hôte externe. Le responsable du traitement ne peut pas confirmer si les données sont identifiables.',
        },
        visibleTo: ['ministry_health', 'data_protection_authority', 'cyber_agency'],
      },
      {
        sequence: 3,
        releaseChunk: 2,
        title: { en: 'Regulatory pressure', fr: 'Pression réglementaire' },
        payload: {
          en: 'Media report the breach. The data-protection authority faces a notification deadline; the ministry is asked for a public statement.',
          fr: "Les médias relaient la fuite. L'autorité de protection des données fait face à un délai de notification ; le ministère est sollicité pour une déclaration publique.",
        },
        visibleTo: ['data_protection_authority', 'ministry_health', 'coordinator'],
      },
    ],
  },
  {
    id: 'education-data-exposure',
    domain: 'education',
    title: {
      en: 'Student-data exposure on a national learning platform',
      fr: "Exposition de données d'élèves sur une plateforme nationale d'apprentissage",
    },
    events: [
      {
        sequence: 1,
        releaseChunk: 0,
        title: { en: 'Platform anomaly reported', fr: 'Anomalie signalée sur la plateforme' },
        payload: {
          en: 'A school reports that the learning platform shows records of pupils from other schools. The operator has not yet confirmed the cause or the scope.',
          fr: "Un établissement signale que la plateforme d'apprentissage affiche des dossiers d'élèves d'autres établissements. L'opérateur n'a pas encore confirmé la cause ni l'étendue.",
        },
        visibleTo: ['education_ministry', 'cyber_agency'],
      },
      {
        sequence: 2,
        releaseChunk: 1,
        title: { en: "Minors' records exposed", fr: 'Dossiers de mineurs exposés' },
        payload: {
          en: 'The operator confirms that records of about 40,000 pupils, with names, dates of birth and assessment results, were reachable for several days. Some pupils are under 13.',
          fr: "L'opérateur confirme que les dossiers d'environ 40 000 élèves, avec noms, dates de naissance et résultats, ont été accessibles pendant plusieurs jours. Certains élèves ont moins de 13 ans.",
        },
        visibleTo: ['data_protection_authority', 'education_ministry', 'legal_advisor', 'cyber_agency'],
      },
      {
        sequence: 3,
        releaseChunk: 2,
        title: { en: 'Parents and media demand answers', fr: 'Parents et médias exigent des réponses' },
        payload: {
          en: "Parents' associations demand notification within 72 hours. A national newspaper publishes the names of two schools. The ministry must decide whether to suspend the platform.",
          fr: 'Des associations de parents exigent une notification sous 72 heures. Un quotidien publie le nom de deux établissements. Le ministère doit décider de suspendre ou non la plateforme.',
        },
        visibleTo: ['education_ministry', 'data_protection_authority', 'legal_advisor', 'coordinator'],
      },
    ],
  },
  {
    id: 'telecom-sim-swap-fraud',
    domain: 'telecom',
    title: {
      en: 'SIM-swap fraud wave after a network outage',
      fr: 'Vague de fraudes à la carte SIM après une panne de réseau',
    },
    events: [
      {
        sequence: 1,
        releaseChunk: 0,
        title: { en: 'Outage and fraud complaints', fr: 'Panne et plaintes pour fraude' },
        payload: {
          en: 'A nationwide outage lasts six hours. Within a day, banks report SIM swaps on accounts of customers who were not affected by the outage.',
          fr: "Une panne nationale dure six heures. En un jour, des banques signalent des changements de carte SIM sur des comptes de clients qui n'ont pas été touchés par la panne.",
        },
        visibleTo: ['telecom_regulator', 'cyber_agency', 'coordinator'],
      },
      {
        sequence: 2,
        releaseChunk: 1,
        title: { en: 'Weak verification process', fr: 'Processus de vérification faible' },
        payload: {
          en: "The operator's logs show that the identity check for SIM replacement was bypassed during the outage, and that a lawful-interception interface was reachable from the customer portal.",
          fr: "Les journaux de l'opérateur montrent que la vérification d'identité pour le remplacement de carte SIM a été contournée pendant la panne, et qu'une interface d'interception légale était accessible depuis le portail client.",
        },
        visibleTo: ['telecom_regulator', 'cyber_agency', 'legal_advisor', 'data_protection_authority'],
      },
      {
        sequence: 3,
        releaseChunk: 2,
        title: { en: 'Customers ask for compensation', fr: 'Les clients demandent une indemnisation' },
        payload: {
          en: 'Consumer groups ask for compensation and a public notice. The data-protection authority asks whether the interception interface exposed call metadata.',
          fr: "Les associations de consommateurs demandent une indemnisation et un avis public. L'APD demande si l'interface d'interception a exposé des métadonnées d'appels.",
        },
        visibleTo: ['telecom_regulator', 'data_protection_authority', 'legal_advisor', 'coordinator'],
      },
    ],
  },
  {
    id: 'public-services-id-leak',
    domain: 'public_services',
    title: {
      en: 'National ID register leak disrupts benefit payments',
      fr: 'Fuite du registre national d’identité qui perturbe le paiement des prestations',
    },
    events: [
      {
        sequence: 1,
        releaseChunk: 0,
        title: { en: 'Unusual register lookups', fr: 'Consultations inhabituelles du registre' },
        payload: {
          en: 'Over three weeks, the national identity register records a spike of lookups at night from a single contractor account.',
          fr: "Pendant trois semaines, le registre national d'identité enregistre une hausse de consultations la nuit depuis un compte de sous-traitant.",
        },
        visibleTo: ['public_services_agency', 'cyber_agency', 'coordinator'],
      },
      {
        sequence: 2,
        releaseChunk: 1,
        title: { en: 'Benefit files found exposed', fr: 'Fichiers de prestations trouvés exposés' },
        payload: {
          en: "Files listing beneficiaries and bank details are found on a public file-sharing site. This month's payments are on hold while the agency verifies them.",
          fr: 'Des fichiers listant bénéficiaires et coordonnées bancaires sont trouvés sur un site de partage public. Les paiements du mois sont suspendus le temps de leur vérification.',
        },
        visibleTo: ['public_services_agency', 'data_protection_authority', 'legal_advisor', 'cyber_agency'],
      },
      {
        sequence: 3,
        releaseChunk: 2,
        title: { en: 'Citizens and oversight react', fr: 'Citoyens et contrôle parlementaire réagissent' },
        payload: {
          en: 'Citizens cannot receive their payments. The parliamentary committee asks for a decision: pay manually or not, and how to notify the people affected.',
          fr: "Des citoyens ne peuvent pas percevoir leurs prestations. La commission parlementaire demande une décision : paiement manuel ou non, et comment informer les personnes concernées.",
        },
        visibleTo: ['public_services_agency', 'coordinator', 'legal_advisor', 'data_protection_authority'],
      },
    ],
  },
  {
    id: 'agriculture-subsidy-fraud',
    domain: 'agriculture',
    title: {
      en: "Fraud on an input-subsidy platform exposes smallholders' data",
      fr: 'Fraude sur une plateforme de subventions d’intrants et exposition des données des petits exploitants',
    },
    events: [
      {
        sequence: 1,
        releaseChunk: 0,
        title: { en: 'Duplicate registrations', fr: 'Inscriptions en double' },
        payload: {
          en: 'The input-subsidy platform registers the same farmers several times, and payments are redirected to accounts held by resellers.',
          fr: 'La plateforme de subventions enregistre plusieurs fois les mêmes exploitants, et les paiements sont redirigés vers des comptes de revendeurs.',
        },
        visibleTo: ['agriculture_ministry', 'coordinator'],
      },
      {
        sequence: 2,
        releaseChunk: 1,
        title: { en: 'Smallholder data sold to resellers', fr: 'Données des petits exploitants vendues à des revendeurs' },
        payload: {
          en: "The platform's export tool gave resellers the phone numbers and plots of about 12,000 smallholders, who then received unsolicited offers.",
          fr: "L'outil d'export de la plateforme a donné aux revendeurs les numéros et parcelles d'environ 12 000 petits exploitants, qui ont reçu des offres non sollicitées.",
        },
        visibleTo: ['agriculture_ministry', 'data_protection_authority', 'legal_advisor'],
      },
      {
        sequence: 3,
        releaseChunk: 2,
        title: { en: 'Who decides on the subsidies?', fr: 'Qui décide des subventions ?' },
        payload: {
          en: 'The ministry asks whether to freeze the programme for the season. The data-protection authority and the coordinator must agree on a joint notice to farmers.',
          fr: "Le ministère demande s'il faut geler le programme pour la saison. L'APD et le coordinateur doivent s'accorder sur un avis commun aux exploitants.",
        },
        visibleTo: ['agriculture_ministry', 'data_protection_authority', 'legal_advisor', 'coordinator'],
      },
    ],
  },
]

/** The sectors that have an authored scenario. */
export const SCENARIO_DOMAINS: Domain[] = AUTHORED.map((scenario) => scenario.domain)

/**
 * The scenario of one sector, its text in the requested language. Agents are the
 * institutions of the sector; events keep their order and visibility.
 */
export function scenarioFor(domain: Domain, country: string, lang: ScenarioLang = 'en'): ScenarioDefinition {
  const authored = AUTHORED.find((scenario) => scenario.domain === domain)
  if (!authored) throw new Error(`No scenario is written for the sector "${domain}".`)
  return {
    id: authored.id,
    domain,
    country,
    title: authored.title[lang],
    lens: 'simulation',
    agents: institutionsForDomain(domain).map((institution) => institution.id),
    events: authored.events.map((event) => ({
      sequence: event.sequence,
      releaseChunk: event.releaseChunk,
      title: event.title[lang],
      payload: event.payload[lang],
      visibleTo: event.visibleTo,
    })),
  }
}

/** The authored content, both languages, for checks and for the scenario list. */
export function authoredScenarios(): AuthoredScenario[] {
  return AUTHORED
}
