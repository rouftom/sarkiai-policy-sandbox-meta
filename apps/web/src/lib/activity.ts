/**
 * Pure helpers for the assistant "activity trail": the compact, collapsible
 * rendering of tool calls / steps during a stream.
 *
 * Kept framework-free so both `apps/organization` and `apps/web` share the
 * aggregation rules and only provide their own labels + JSX.
 */

export type ActivityStatus = 'pending' | 'active' | 'complete' | 'error'

export interface ActivityCall {
  toolCallId: string
  toolName: string
  args?: Record<string, unknown>
  /** A result/output has been received for this call. */
  hasResult: boolean
  /** The call failed. */
  isError?: boolean
  /**
   * Custom UI for this specific call (MCP app, plan card, form…). A call with a
   * UI is never merged: it becomes its own step so the UI is not swallowed.
   */
  ui?: unknown
}

export interface ActivityStep {
  key: string
  toolName: string
  /** Number of collapsed identical calls in this step. */
  count: number
  status: ActivityStatus
  calls: ActivityCall[]
  /** First call's custom UI, if any. */
  ui?: unknown
  /** Earliest time this step's first call was seen (epoch ms), when known. */
  startedAt?: number
}

/** UI part types that are not a concrete tool and must not be treated as one. */
const RESERVED_PART_TYPES = new Set([
  'tool-invocation',
  'tool-result',
  'tool-call',
  'tool-approval-request',
  'tool-approval-response',
  'dynamic-tool',
])

/**
 * AI SDK v5 UI parts carry the tool name in `type` (`tool-<name>`) rather than a
 * `toolName` field. Returns '' for non-tool / reserved types.
 */
export function toolNameFromPartType(type: unknown): string {
  const value = String(type || '')
  return value.startsWith('tool-') && !RESERVED_PART_TYPES.has(value)
    ? value.slice('tool-'.length)
    : ''
}

function statusOf(calls: ActivityCall[]): ActivityStatus {
  if (calls.some((call) => call.isError)) return 'error'
  if (calls.length > 0 && calls.every((call) => call.hasResult)) return 'complete'
  if (calls.some((call) => !call.hasResult)) return 'active'
  return 'pending'
}

/**
 * Collapses consecutive calls of the same tool into a single step carrying a
 * `count`. Calls with their own UI stay separate so their UI keeps rendering.
 * Order follows first occurrence.
 */
export function aggregateActivityCalls(calls: ActivityCall[]): ActivityStep[] {
  const steps: ActivityStep[] = []
  const byName = new Map<string, ActivityStep>()

  for (const call of calls) {
    if (call.ui) {
      steps.push({
        key: call.toolCallId,
        toolName: call.toolName,
        count: 1,
        status: statusOf([call]),
        calls: [call],
        ui: call.ui,
      })
      continue
    }

    const existing = byName.get(call.toolName)
    if (existing) {
      existing.count += 1
      existing.calls.push(call)
      existing.status = statusOf(existing.calls)
      continue
    }

    const step: ActivityStep = {
      key: call.toolCallId,
      toolName: call.toolName,
      count: 1,
      status: statusOf([call]),
      calls: [call],
    }
    byName.set(call.toolName, step)
    steps.push(step)
  }

  return steps
}

/** Attaches the earliest known start time to each step (for the elapsed header). */
export function withStartTimes(
  steps: ActivityStep[],
  startTimes: Map<string, number>,
): ActivityStep[] {
  return steps.map((step) => {
    const times = step.calls
      .map((call) => startTimes.get(call.toolCallId))
      .filter((value): value is number => typeof value === 'number')
    return {
      ...step,
      startedAt: times.length > 0 ? Math.min(...times) : step.startedAt,
    }
  })
}

/** Human, compact duration: `12s`, `1 min 05s`, `3 min`. */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds ? `${minutes} min ${String(seconds).padStart(2, '0')}s` : `${minutes} min`
}
