/** Authored table-top exercises (N8). Timed injects built on the incident scenario. */

import type { ExerciseDefinition } from '@sps/exercise'

export function healthBreachExercise(country: string): ExerciseDefinition {
  return {
    id: 'health-breach-drill',
    title: 'Health-data breach table-top drill',
    country,
    domain: 'health',
    scenarioRunId: 'health-data-breach',
    durationMinutes: 120,
    references: [
      {
        title: 'Loi relative à la protection des données à caractère personnel au Cameroun (23 décembre 2024)',
        authority: 'Présidence de la République / Parlement',
        documentId: 'cm-data-protection-law-2024',
      },
      {
        title: 'Plan Stratégique National de Santé Numérique (PSNSN) 2026-2030',
        authority: 'Ministère de la Santé publique',
        documentId: 'cm-health-digital-psnsn-2026-2030',
      },
    ],
    injects: [
      {
        id: 'inj-1',
        atMinute: 0,
        title: 'Anomalous access',
        detail:
          'The SIEM flags a service account reading patient records outside working hours. The volume is small but the account is shared.',
        visibleTo: ['ministry_health', 'cyber_agency'],
        expectedAction: 'Open an incident, preserve the logs and page the cyber agency.',
        responseWindowMinutes: 15,
        severity: 'high',
      },
      {
        id: 'inj-2',
        atMinute: 20,
        title: 'Scope widens',
        detail:
          'A 4 GB transfer to an external host is confirmed. The data may include identifiable patient records.',
        visibleTo: ['ministry_health', 'cyber_agency', 'data_protection_authority'],
        expectedAction: 'Assess the notification duty and inform the data-protection authority.',
        responseWindowMinutes: 30,
        severity: 'critical',
      },
      {
        id: 'inj-3',
        atMinute: 45,
        title: 'Press call',
        detail: 'A journalist asks for a statement and mentions an internal memo.',
        visibleTo: ['ministry_health', 'coordinator'],
        expectedAction: 'Route the request to the communication cell and agree one line.',
        responseWindowMinutes: 10,
        severity: 'medium',
      },
      {
        id: 'inj-4',
        atMinute: 75,
        title: 'Regulator letter',
        detail:
          'The data-protection authority asks for the facts, the legal basis and the measures taken, with a deadline.',
        visibleTo: ['ministry_health', 'data_protection_authority', 'coordinator'],
        expectedAction: 'Assign an owner and log the deadline in the incident file.',
        responseWindowMinutes: 20,
        severity: 'high',
      },
    ],
  }
}
