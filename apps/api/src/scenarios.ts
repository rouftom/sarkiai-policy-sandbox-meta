/** Authored scenarios available to the engine. */

import type { ScenarioDefinition } from '@sps/scenarios'
import { institutionsForDomain } from '@sps/shared'

export function healthDataBreach(country: string): ScenarioDefinition {
  return {
    id: 'health-data-breach',
    domain: 'health',
    country,
    title: 'Health-data breach in a public hospital',
    lens: 'simulation',
    agents: institutionsForDomain('health').map((i) => i.id),
    events: [
      {
        sequence: 1,
        releaseChunk: 0,
        title: 'Incident reported',
        payload:
          'Anomalous access to the national e-health platform is detected. The hospital IT team is investigating but has not yet scoped the incident.',
        visibleTo: ['ministry_health', 'cyber_agency'],
      },
      {
        sequence: 2,
        releaseChunk: 1,
        title: 'Scope widens',
        payload:
          'Patient records may have been exfiltrated to an external host. The controller cannot confirm whether the data are identifiable.',
        visibleTo: ['ministry_health', 'data_protection_authority', 'cyber_agency'],
      },
      {
        sequence: 3,
        releaseChunk: 2,
        title: 'Regulatory pressure',
        payload:
          'Media report the breach. The data-protection authority faces a notification deadline; the ministry is asked for a public statement.',
        visibleTo: ['data_protection_authority', 'ministry_health', 'coordinator'],
      },
    ],
  }
}
