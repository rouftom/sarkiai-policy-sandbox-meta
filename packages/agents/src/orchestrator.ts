/**
 * Policy orchestrator: runs one institutional agent for one question, grounded
 * in the country KB, with persisted chain-of-thought + audit trail.
 *
 * The multi-agent coordination protocol lives in `@sps/scenarios`; this module
 * is the single-agent unit it composes.
 */

import { generateText, type LanguageModel, type UserContent } from 'ai'
import type {
  AgentAssessment,
  Citation,
  CitationValidation,
  Domain,
  InstitutionSpec,
  ProviderDescriptor,
  WorkflowLens,
} from '@sps/shared'
import type { Retriever } from '@sps/retrieval'
import { citationFromChunk, citationRetryDirective, validateCitations } from '@sps/citations'
import type { AuditService } from '@sps/audit'
import { attachmentGuardrail, buildSystemPrompt, citationDirective } from './prompt'
import { describeProvider } from './provider'

export interface Attachment {
  mime: string
  dataBase64: string
}

export interface AttachmentMeta {
  sha256: string
  mime: string
  size: number
  key: string
}

export interface AgentRunInput {
  institution: InstitutionSpec
  question: string
  country: string
  jurisdiction?: 'national' | 'regional' | 'international'
  domain: Domain
  lens: WorkflowLens
  runId?: string
  topK?: number
  /**
   * Generation attempts allowed by the citation validator (default 2: one
   * answer, one corrective retry). Fabricated quotes are never shipped.
   */
  maxAttempts?: number
  /** Overrides `OrchestratorDeps.maxOutputTokens` for this run. */
  maxOutputTokens?: number
  /** Optional user-supplied images (untrusted context). */
  attachments?: Attachment[]
  /** Storage/audit metadata for the attachments (hashes, keys). */
  attachmentMeta?: AttachmentMeta[]
}

export interface OrchestratorDeps {
  model: LanguageModel
  retriever: Retriever
  audit?: AuditService
  /** Active provider, recorded in every trace step (never contains a secret). */
  provider?: ProviderDescriptor
  /**
   * Output ceiling per generation. Reasoning models spend output tokens before
   * answering (muse-spark-1.3: 600–1500), so a tight cap returns an empty answer.
   * The ceiling is not billed — only produced tokens are.
   */
  maxOutputTokens?: number
}

export class PolicyOrchestrator {
  constructor(private readonly deps: OrchestratorDeps) {}

  /** `mode · model` of whatever answered — persisted with each trace step. */
  private modelLabel(): string {
    return this.deps.provider ? describeProvider(this.deps.provider) : 'configured'
  }

  async runAgent(input: AgentRunInput): Promise<AgentAssessment> {
    const { institution, question, country, domain, lens } = input
    const runId = input.runId ?? `run-${Date.now()}`

    // 1. Retrieve country provisions (collection → retrieval stage).
    const chunks = await this.deps.retriever.search({
      text: question,
      country,
      jurisdiction: input.jurisdiction,
      topK: input.topK ?? 8,
    })
    const citations: Citation[] = chunks.map((chunk) => citationFromChunk(chunk))

    // 2. Trap the reasoning: pre-decision trace.
    await this.deps.audit?.traceStep({
      runId,
      agentId: institution.id,
      step: 0,
      thought: `Retrieved ${chunks.length} provisions for "${question}" in ${country}.`,
      toolCalls: [
        {
          name: 'retrieve',
          input: { question, country, attachments: input.attachmentMeta ?? [] },
          output: citations.map((c) => c.filename),
        },
      ],
      model: this.modelLabel(),
    })

    // 3. Generate the grounded answer (multimodal when attachments are present).
    const hasAttachments = (input.attachments?.length ?? 0) > 0
    const system = [
      buildSystemPrompt({ institution, country, domain, chunks }),
      citationDirective(),
      hasAttachments ? attachmentGuardrail() : '',
    ]
      .filter(Boolean)
      .join('\n\n')

    /** User turn for one attempt: the question (or the retry prompt) + attachments. */
    const userContent = (promptText: string): UserContent => {
      const parts: UserContent = [{ type: 'text', text: promptText }]
      for (const attachment of input.attachments ?? []) {
        parts.push({
          type: 'image',
          image: `data:${attachment.mime};base64,${attachment.dataBase64}`,
          mediaType: attachment.mime,
        })
      }
      return parts
    }

    // 4. Generate, then validate: quotes absent from the corpus are rejected
    //    and the agent answers again with a corrective directive.
    const maxAttempts = Math.max(1, input.maxAttempts ?? 2)
    let attempt = 0
    let text = ''
    let reasoningText = ''
    // Validate against the full chunk text, not the truncated display excerpt.
    const corpus = chunks.map((chunk) => chunk.text).join('\n')
    let validation: CitationValidation = validateCitations('', citations, { attempts: 0, corpus })

    while (attempt < maxAttempts) {
      attempt += 1
      const prompt = attempt === 1 ? question : `${question}\n\n${citationRetryDirective(validation.rejected)}`

      const { text: answer, reasoning } = await generateText({
        model: this.deps.model,
        system,
        maxOutputTokens: input.maxOutputTokens ?? this.deps.maxOutputTokens ?? 4096,
        ...(hasAttachments ? { messages: [{ role: 'user' as const, content: userContent(prompt) }] } : { prompt }),
      })

      text = answer
      reasoningText = (reasoning ?? []).map((part) => part.text).join('\n')
      validation = validateCitations(answer, citations, { attempts: attempt, corpus })

      if (validation.ok) break

      const lastAttempt = attempt >= maxAttempts
      await this.deps.audit?.traceStep({
        runId,
        agentId: institution.id,
        step: attempt,
        thought: `Citation validator rejected answer ${attempt}/${maxAttempts}: ${
          validation.rejected.length
            ? `${validation.rejected.length} quote(s) absent from the retrieved corpus`
            : 'no provision cited'
        }.${lastAttempt ? ' Retry budget exhausted; the gap is reported instead of the claim.' : ' Asking the agent to answer again.'}`,
        toolCalls: [
          {
            name: 'validate-citations',
            input: { attempt, quotes: validation.rejected },
            output: { ok: false, used: validation.used.map((c) => c.filename) },
          },
        ],
        model: this.modelLabel(),
      })
      if (!lastAttempt) {
        await this.deps.audit?.logAction({
          actor: institution.id,
          action: 'citation.rejected',
          target: `${domain};attempt:${attempt};quotes:${validation.rejected.length}`,
          lens,
          citations: validation.used,
          runId,
        })
      }
    }

    const grounded = validation.ok

    // 5. Persist chain-of-thought + audit for the answer that is returned.
    await this.deps.audit?.traceStep({
      runId,
      agentId: institution.id,
      step: attempt + 1,
      thought: reasoningText || text,
      toolCalls: [
        {
          name: 'generate',
          input: { question, attempt },
          output: { grounded, rejectedQuotes: validation.rejected.length },
        },
      ],
      model: this.modelLabel(),
    })
    await this.deps.audit?.logAction({
      actor: institution.id,
      action: 'agent.assessment',
      target: input.attachmentMeta?.length ? `${domain};attachments:${input.attachmentMeta.map((a) => a.sha256).join(',')}` : domain,
      lens,
      citations: validation.used.length ? validation.used : citations,
      runId,
    })

    return {
      agentId: institution.id,
      role: institution.role,
      mandate: institution.mandate,
      domain,
      findings: [text],
      citations,
      gaps: grounded
        ? []
        : [
            {
              id: `${runId}-${institution.id}-citation`,
              domain,
              dimension: 'contextualization',
              description: `Unverified citations in the answer (${validation.rejected.length} rejected quote(s), ${attempt} attempt(s)).`,
              severity: 'high',
            },
          ],
      confidence: grounded ? 0.85 : 0.4,
      cotTraceId: `${runId}:${institution.id}`,
      validation,
    }
  }
}
