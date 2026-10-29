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
import { languageName, type AnswerLanguage } from './prompt'
import { StructuredOutputError, generateStructured } from './structured'

export interface CoordinatorDeps {
  model: LanguageModel
  orchestrator: PolicyOrchestrator
  audit?: AuditService
}

export interface CoordinatorTickInput {
  /** The language of the agents' answers and of the joint report (default English). */
  language?: AnswerLanguage
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

const leadSchema = z.object({
  action: z.enum(['evaluate', 'reevaluate', 'finish']),
  dimension: z.string().default(''),
  hint: z.string().default(''),
  reason: z.string().default(''),
})

/** What the lead agent sees of a readiness assessment in progress. */
export interface ReadinessLeadInput {
  /** The language of the reason and the focus (default English). */
  language?: AnswerLanguage
  country: string
  domain: Domain
  remaining: Array<{ dimension: string; dimensionId: number; name: string }>
  done: Array<{ dimension: string; dimensionId: number; name: string; score: number; confidence: number; gaps: number }>
  decisionsLeft: number
  userId?: string
}

/** The lead agent's decision, before the engine checks it against the assessment. */
export interface ReadinessLeadDecision {
  action: 'evaluate' | 'reevaluate' | 'finish'
  dimension: string
  hint: string
  reason: string
}

const RECONCILE_UNAVAILABLE = 'Reconciliation unavailable: the model did not return a valid joint report. The individual assessments above are unchanged.'

export class MultiAgentCoordinator {
  constructor(private readonly deps: CoordinatorDeps) {}

  /** Build the per-agent question from the partial information it received. */
  private buildQuestion(institution: InstitutionSpec, visible: ScenarioEvent[], language: AnswerLanguage): string {
    const fr = language === 'fr'
    const events =
      visible.map((e) => `- [${e.title}] ${e.payload}`).join('\n') ||
      (fr ? '- (aucun événement ne vous a encore été transmis)' : '- (no event has been released to you yet)')

    if (fr) {
      return [
        `Vous êtes « ${institution.name} ». Voici les événements qui vous ont été transmis à ce stade (information partielle et éventuellement asymétrique) :`,
        events,
        '',
        'Sur la base de votre mandat et des dispositions applicables, évaluez la situation et recommandez les actions qui relèvent STRICTEMENT de votre compétence. Citez chaque disposition (fichier · ARTICLE n). Si une question dépasse votre mandat, indiquez-le explicitement.',
      ].join('\n')
    }
    return [
      `You are "${institution.name}". These are the events released to you so far (partial, possibly asymmetric information):`,
      events,
      '',
      'On the basis of your mandate and the applicable provisions, assess the situation and recommend the actions that fall STRICTLY within your competence. Cite each provision (file · ARTICLE n). If a question goes beyond your mandate, say so explicitly.',
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
            question: this.buildQuestion(institution, visible, input.language ?? 'en'),
            country: input.country,
            domain: input.domain,
            lens: input.lens,
            language: input.language ?? 'en',
            runId: input.runId,
            ...(input.userId ? { userId: input.userId } : {}),
          })
          .then((assessment) => ({ ...assessment, durationMs: Date.now() - started }))
      }),
    )
    return assessments
  }

  /** Reconcile independent assessments into a joint situation report. */
  /**
   * Orchestrated readiness: the coordinator acts as lead agent. From the dimensions
   * scored so far, it picks the next one to evaluate, asks for a new pass on one
   * (with a focus), or finishes. Every decision is audited with its reason.
   */
  async decideReadinessStep(input: ReadinessLeadInput): Promise<ReadinessLeadDecision> {
    const scored = input.done.length
      ? input.done
          .map((d) => `- ${d.dimension} (D${d.dimensionId} ${d.name}): ${d.score}/5, confidence ${d.confidence}, ${d.gaps} gap(s)`)
          .join('\n')
      : '- (none yet)'
    const pending = input.remaining.map((d) => `${d.dimension} (D${d.dimensionId} ${d.name})`).join(', ') || '(none)'

    const object = await generateStructured({
      model: this.deps.model,
      schema: leadSchema,
      shape: '{"action": "evaluate"|"reevaluate"|"finish", "dimension": string, "hint": string, "reason": string}',
      system: `You are the lead agent of an AI-readiness assessment. Each dimension is scored by a specialist pass. You decide the order.
- "evaluate": the next pending dimension. In "dimension", write its identifier exactly as listed (the word before the parentheses, never the name or the D-number). Prefer dimensions whose results depend on the ones already scored (e.g. governance before standards).
- "reevaluate": a new pass on a scored dimension, when its score looks inconsistent with the others or its confidence is low. In "dimension", its identifier as listed under "Scored so far". Give the focus in "hint" (one or two sentences).
- "finish": only when no dimension is pending.
Keep "reason" and "hint" short and factual, written in ${languageName(input.language ?? 'en')}. Decisions left: ${input.decisionsLeft}.`,
      prompt: `Country: ${input.country} · Domain: ${input.domain}\n\nScored so far:\n${scored}\n\nPending: ${pending}`,
    })

    await this.deps.audit?.logAction({
      actor: 'coordinator',
      ...(input.userId ? { userId: input.userId } : {}),
      action: 'readiness.decided',
      target: `${object.action}:${object.dimension || '-'}`,
      lens: 'readiness',
      citations: [],
    })

    // The identifier as listed; a name or a D-number written instead is matched back to it.
    const known = [...input.done, ...input.remaining]
    const match = known.find((d) => d.dimension === object.dimension) ?? known.find((d) => object.dimension.includes(d.dimension) || object.dimension.startsWith(`D${d.dimensionId} `))
    return { action: object.action, dimension: match?.dimension ?? object.dimension, hint: object.hint, reason: object.reason }
  }

  async reconcile(
    input: {
      runId: string
      tick: number
      country: string
      domain: Domain
      assessments: AgentAssessment[]
      userId?: string
      language?: AnswerLanguage
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
- Focus on domain-specific gaps and coordination problems, not country-specific policy recommendations.
- Write every text value in ${languageName(input.language ?? 'en')}; keep the JSON field names as they are.`,
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
