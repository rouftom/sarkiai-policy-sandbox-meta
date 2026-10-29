/**
 * Multi-agent coordinator.
 *
 * Implements hackathon §5–§6: run the institutions that are allowed to see a
 * given scenario tick (information asymmetry), collect their independent
 * assessments, then reconcile them into a joint situation report · surfacing
 * agreements, mandate conflicts and unresolved questions.
 */

import type { LanguageModel } from 'ai'
import { z } from 'zod'
import type {
  AgentAssessment,
  Citation,
  Domain,
  InstitutionSpec,
  JointSituationReport,
  MandateConflict,
  ScenarioEvent,
  WorkflowLens,
} from '@sps/shared'
import type { AuditService } from '@sps/audit'
import type { PolicyOrchestrator } from './orchestrator'
import { StructuredOutputError, generateStructured } from './structured'

export interface CoordinatorDeps {
  model: LanguageModel
  orchestrator: PolicyOrchestrator
  audit?: AuditService
}

export interface CoordinatorTickInput {
  runId: string
  /** Operator (e-mail) who launched the run. */
  userId?: string
  tick: number
  country: string
  domain: Domain
  lens: WorkflowLens
  /** All institutions in the scenario. */
  institutions: InstitutionSpec[]
  /** Events released at this tick (already filtered per agent downstream). */
  events: ScenarioEvent[]
  /** All events released so far (cumulative context per agent). */
  history: ScenarioEvent[]
}

const reconcileSchema = z.object({
  agreements: z.array(z.string()).default([]),
  conflicts: z
    .array(
      z.object({
        between: z.array(z.string()).min(2).max(2),
        summary: z.string(),
        positions: z.array(z.object({ agentId: z.string(), position: z.string() })).min(1),
        severity: z.enum(['low', 'medium', 'high', 'critical']),
      }),
    )
    .default([]),
  openQuestions: z.array(z.string()).default([]),
  summary: z.string().default(''),
})

const RECONCILE_SHAPE = `{"agreements": string[], "conflicts": [{"between": [string, string], "summary": string, "positions": [{"agentId": string, "position": string}], "severity": "low" | "medium" | "high" | "critical"}], "openQuestions": string[], "summary": string}`

const RECONCILE_UNAVAILABLE = 'Reconciliation unavailable: the model did not return a valid joint report. The individual assessments above are unchanged.'

export class MultiAgentCoordinator {
  constructor(private readonly deps: CoordinatorDeps) {}

  /** Build the per-agent question from the partial information it received. */
  private buildQuestion(institution: InstitutionSpec, visible: ScenarioEvent[]): string {
    const events = visible
      .map((e) => `- [${e.title}] ${e.payload}`)
      .join('\n') || '- (aucun événement ne vous a encore été transmis)'

    return [
      `Vous êtes « ${institution.name} ». Voici les événements qui vous ont été transmis à ce stade (information partielle et éventuellement asymétrique) :`,
      events,
      '',
      'Sur la base de votre mandat et des dispositions applicables, évaluez la situation et recommandez les actions qui relèvent STRICTEMENT de votre compétence. Citez chaque disposition (fichier · ARTICLE n). Si une question dépasse votre mandat, indiquez-le explicitement.',
    ].join('\n')
  }

  /** Run one tick: every institution that saw an event produces an independent assessment. */
  async runTick(input: CoordinatorTickInput): Promise<AgentAssessment[]> {
    const releasedThisTick = new Set(input.events.flatMap((e) => e.visibleTo))
    const active = input.institutions.filter((i) => releasedThisTick.has(i.id))
    if (active.length === 0) return []

    const assessments = await Promise.all(
      active.map((institution) => {
        const visible = input.history.filter(
          (e) => e.releaseChunk <= input.tick && e.visibleTo.includes(institution.id),
        )
        const started = Date.now()
        return this.deps.orchestrator
          .runAgent({
            institution,
            question: this.buildQuestion(institution, visible),
            country: input.country,
            domain: input.domain,
            lens: input.lens,
            runId: input.runId,
            ...(input.userId ? { userId: input.userId } : {}),
          })
          .then((assessment) => ({ ...assessment, durationMs: Date.now() - started }))
      }),
    )
    return assessments
  }

  /** Reconcile independent assessments into a joint situation report. */
  async reconcile(
    input: {
      runId: string
      tick: number
      country: string
      domain: Domain
      assessments: AgentAssessment[]
      userId?: string
    },
  ): Promise<JointSituationReport> {
    const digest = input.assessments
      .map(
        (a) =>
          `### ${a.agentId} (confiance ${a.confidence})\nMANDAT: ${a.mandate}\nÉVALUATION: ${a.findings.join('\n')}\nCITATIONS: ${a.citations
            .map((c) => c.filename + (c.articleNumber ? ` ARTICLE ${c.articleNumber}` : ''))
            .join('; ')}`,
      )
      .join('\n\n')

    let object: z.infer<typeof reconcileSchema>
    try {
      object = await generateStructured({
        model: this.deps.model,
        schema: reconcileSchema,
        shape: RECONCILE_SHAPE,
        system: `You are the inter-institutional coordinator. Reconcile the independent assessments of mandated institutions into a joint situation report.
- Identify AGREEMENTS (shared conclusions).
- Identify CONFLICTS between mandates (e.g. one actor's duty clashes with another's): state both positions and the provisions in tension. Be precise, do not invent conflicts.
- List OPEN QUESTIONS where no single actor has the full picture.
- Focus on domain-specific gaps and coordination problems, not country-specific policy recommendations.`,
        prompt: `Country: ${input.country} · Domain: ${input.domain}\n\n${digest}`,
      })
    } catch (error) {
      if (!(error instanceof StructuredOutputError)) throw error
      object = { agreements: [], conflicts: [], openQuestions: [], summary: RECONCILE_UNAVAILABLE }
    }

    const citations = input.assessments.flatMap((a) => a.citations)
    const conflicts: MandateConflict[] = object.conflicts.map((c, i) => ({
      id: `${input.runId}-t${input.tick}-c${i}`,
      between: [c.between[0] ?? '', c.between[1] ?? ''],
      summary: c.summary,
      positions: c.positions,
      severity: c.severity,
      citations: [],
    }))

    await this.deps.audit?.logAction({
      actor: 'coordinator',
      ...(input.userId ? { userId: input.userId } : {}),
      action: 'scenario.reconcile',
      target: `tick:${input.tick}`,
      lens: 'hybrid',
      citations,
      runId: input.runId,
    })

    return {
      runId: input.runId,
      tick: input.tick,
      domain: input.domain,
      country: input.country,
      assessments: input.assessments,
      agreements: object.agreements,
      conflicts,
      openQuestions: object.openQuestions,
      gaps: input.assessments.flatMap((a) => a.gaps),
      citations,
      summary: object.summary,
      generatedAt: new Date().toISOString(),
    }
  }
}
