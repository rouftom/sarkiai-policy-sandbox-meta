/**
 * Prompts for the figures of the after-action report.
 *
 * Figures are about the domain first: systems, documents, places, data flows.
 * People are allowed in one figure only, at most two, and then they are African
 * professionals dressed for the institution they represent in the exercise.
 */

import type { ExerciseDefinition, ExerciseInject, ReportLang } from './exercise.js'

export const MAX_PEOPLE_IN_FIGURE = 2

/** What each institution's professional wears when a figure shows people. */
export const INSTITUTION_ATTIRE: Record<string, string> = {
  ministry_health: 'a doctor in a white medical coat with a stethoscope',
  cyber_agency: 'a cybersecurity engineer in a polo shirt with an ID badge, working at a laptop',
  data_protection_authority: 'a lawyer in a dark suit, holding case files',
  coordinator: 'a civil servant in a dark business suit',
  telecom_regulator: 'a telecom engineer in a company polo shirt with a tablet',
}

const DOMAIN_SETTING: Record<string, string> = {
  health: 'a hospital records system: secure data-centre racks, a screen showing a locked patient-record database, a shield icon',
  education: 'a school administration network: student-record servers, a registry office, learning-platform dashboards',
  telecom: 'a telecom operations centre: network maps, fibre routers, traffic graphs on large screens',
  public_services: 'a public-service data hub: citizen-registry servers, document stacks, service counters',
  agriculture: 'an agricultural information system: field sensor maps, weather dashboards, warehouse records',
}

const STYLE = 'Realistic, muted teal and white palette, no readable text, no logos, no watermark.'

/** Institutions that see the exercise's injects, in the order they first appear. */
function institutionsOf(definition: ExerciseDefinition): string[] {
  const seen: string[] = []
  for (const inject of definition.injects) {
    for (const id of inject.visibleTo) if (!seen.includes(id) && INSTITUTION_ATTIRE[id]) seen.push(id)
  }
  return seen
}

export interface FigureBrief {
  id: 'context' | 'timeline'
  prompt: string
  fallbackTitle: string
  fallbackLines: string[]
}

export function figureBriefs(definition: ExerciseDefinition, lang: ReportLang): FigureBrief[] {
  const setting = DOMAIN_SETTING[definition.domain] ?? 'an institutional operations room with screens and document stacks'
  const people = institutionsOf(definition).slice(0, MAX_PEOPLE_IN_FIGURE)
  const peopleClause =
    people.length === 0
      ? 'No people in the picture: only the setting and objects.'
      : `At most ${people.length} ${people.length === 1 ? 'person' : 'people'}, no more: ${people
          .map((id) => INSTITUTION_ATTIRE[id])
          .join(' and ')}. They are Black African professionals in a Central African setting, realistic and dressed for their role.`

  const timelineLines = definition.injects.map((inject: ExerciseInject) => `T+${inject.atMinute} · ${inject.title}`)

  return [
    {
      id: 'context',
      prompt: `Editorial image of ${setting}, showing the crisis the exercise simulates. The domain is the subject. ${peopleClause} ${STYLE}`,
      fallbackTitle: definition.title,
      fallbackLines: [`${definition.country.toUpperCase()} · ${definition.domain}`],
    },
    {
      id: 'timeline',
      prompt: `Clean flat infographic timeline of a crisis exercise with ${definition.injects.length} milestones, drawn with abstract shapes, icons and short labels. No people, no photographs. ${lang === 'fr' ? 'Labels in French.' : 'Labels in English.'} White background, ${STYLE}`,
      fallbackTitle: lang === 'fr' ? 'Chronologie des incidents' : 'Incident timeline',
      fallbackLines: timelineLines,
    },
  ]
}
