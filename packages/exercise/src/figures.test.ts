import { describe, expect, test } from 'bun:test'
import type { ExerciseDefinition } from './exercise.js'
import { figureBriefs, INSTITUTION_ATTIRE, MAX_PEOPLE_IN_FIGURE } from './figures.js'

const base: ExerciseDefinition = {
  id: 'drill',
  title: 'Health-data breach drill',
  country: 'cm',
  domain: 'health',
  durationMinutes: 120,
  injects: [
    { id: 'inj-1', atMinute: 0, title: 'Anomalous access', detail: 'x', visibleTo: ['ministry_health', 'cyber_agency'], expectedAction: 'x' },
    { id: 'inj-2', atMinute: 20, title: 'Scope widens', detail: 'x', visibleTo: ['data_protection_authority', 'cyber_agency', 'coordinator'], expectedAction: 'x' },
  ],
}

describe('figure briefs', () => {
  test('both figures ask for a 16:9 landscape composition', () => {
    for (const brief of figureBriefs(base, 'en')) expect(brief.prompt).toContain('16:9')
  })

  test('the timeline never shows people', () => {
    const timeline = figureBriefs(base, 'en').find((brief) => brief.id === 'timeline')!
    expect(timeline.prompt).toContain('No people')
    expect(timeline.prompt).not.toContain('Black African')
  })

  test('the context figure shows at most two people, dressed for their institutions', () => {
    const context = figureBriefs(base, 'en').find((brief) => brief.id === 'context')!
    expect(context.prompt).toContain(`At most ${MAX_PEOPLE_IN_FIGURE} people`)
    expect(context.prompt).toContain(INSTITUTION_ATTIRE.ministry_health!)
    expect(context.prompt).toContain(INSTITUTION_ATTIRE.cyber_agency!)
    expect(context.prompt).not.toContain(INSTITUTION_ATTIRE.data_protection_authority!)
    expect(context.prompt).toContain('Black African')
  })

  test('without institutions the context figure has no people at all', () => {
    const bare = { ...base, injects: [{ ...base.injects[0]!, visibleTo: ['unknown_body'] }] }
    const context = figureBriefs(bare, 'en').find((brief) => brief.id === 'context')!
    expect(context.prompt).toContain('No people in the picture')
    expect(context.prompt).not.toContain('Black African')
  })

  test('the domain sets the setting, and the labels follow the report language', () => {
    const [context, timeline] = figureBriefs(base, 'fr')
    expect(context!.prompt).toContain('hospital records system')
    expect(timeline!.prompt).toContain('Labels in French')
    expect(timeline!.fallbackTitle).toBe('Chronologie des incidents')
  })
})
