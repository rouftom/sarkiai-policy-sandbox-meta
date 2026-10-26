/**
 * Progressive error-scenario engine.
 *
 * Hackathon requirement #5: events must be released in sequenced, chunked order
 * — never all at once — and different agents may receive different events
 * (information asymmetry). `release()` is an async generator: each yield is one
 * event delivery, optionally gated by a caller-provided delay/approval hook.
 */

import type { Domain, ScenarioEvent, ScenarioRun, WorkflowLens } from '@sps/shared'

export interface ScenarioDefinition {
  id: string
  domain: Domain
  country: string
  title: string
  lens: WorkflowLens
  agents: string[]
  events: Array<Omit<ScenarioEvent, 'runId' | 'createdAt' | 'id'> & { id?: string }>
}

export interface ReleaseOptions {
  /** Pause (ms) between chunks — realistic "received at different times". */
  chunkDelayMs?: number
  /** Await a hook before each release (e.g. facilitator approval). */
  onBeforeRelease?: (event: ScenarioEvent) => Promise<void> | void
}

export class ScenarioEngine {
  constructor(private readonly definition: ScenarioDefinition) {}

  toRun(): ScenarioRun {
    return {
      id: this.definition.id,
      domain: this.definition.domain,
      country: this.definition.country,
      title: this.definition.title,
      lens: this.definition.lens,
      agents: this.definition.agents,
      events: this.definition.events.map((event, i) => ({
        ...event,
        id: event.id ?? `${this.definition.id}-e${i + 1}`,
        runId: this.definition.id,
        createdAt: new Date().toISOString(),
      })),
      status: 'draft',
    }
  }

  /**
   * Yield events in order, grouped by `releaseChunk`. Each group is a "tick":
   * all events with the same releaseChunk are delivered together, then the
   * engine pauses before the next tick.
   */
  async *release(options: ReleaseOptions = {}): AsyncGenerator<ScenarioEvent[]> {
    const run = this.toRun()
    const chunks = [...new Set(run.events.map((e) => e.releaseChunk))].sort((a, b) => a - b)

    for (const chunkIndex of chunks) {
      const batch = run.events
        .filter((e) => e.releaseChunk === chunkIndex)
        .sort((a, b) => a.sequence - b.sequence)

      for (const event of batch) {
        await options.onBeforeRelease?.(event)
      }

      yield batch

      if (options.chunkDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.chunkDelayMs))
      }
    }
  }

  /** The subset of events a given agent is allowed to see up to (and incl.) a tick. */
  eventsForAgent(agentId: string, upToChunk: number): ScenarioEvent[] {
    return this.toRun().events.filter((e) => e.releaseChunk <= upToChunk && e.visibleTo.includes(agentId))
  }
}
