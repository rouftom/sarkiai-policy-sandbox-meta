/**
 * Caps concurrent work on the routes that spend model credits.
 *
 * One console action can ask for a lot: a readiness series runs one stream per
 * sector in parallel, and each stream fans out over its dimensions. This gate
 * bounds that burst without a queue — past the cap the API answers 429 right
 * away, which keeps the instance responsive instead of letting every request
 * slow down together. A bounded queue would trade a clear refusal for a
 * connection that sits open, which the console cannot show as progress.
 */

export interface GateLimits {
  /** Streams one operator may run at once. */
  perOperator: number
  /** Streams the whole process may run at once. */
  global: number
}

export interface GateLease {
  /** Idempotent: a response can finish and close in either order. */
  release(): void
}

export class WorkGate {
  private total = 0
  private readonly perOperator = new Map<string, number>()
  private readonly limits: GateLimits

  constructor(limits: GateLimits) {
    this.limits = limits
  }

  /** A lease to release in `finally`, or null when a cap is reached. */
  tryEnter(operator: string): GateLease | null {
    if (this.total >= this.limits.global) return null
    const mine = this.perOperator.get(operator) ?? 0
    if (mine >= this.limits.perOperator) return null

    this.total += 1
    this.perOperator.set(operator, mine + 1)

    let released = false
    return {
      release: () => {
        if (released) return
        released = true
        this.total = Math.max(0, this.total - 1)
        const left = (this.perOperator.get(operator) ?? 1) - 1
        if (left <= 0) this.perOperator.delete(operator)
        else this.perOperator.set(operator, left)
      },
    }
  }

  /** Work in flight, for tests and diagnostics. */
  get active(): number {
    return this.total
  }

  /** Work in flight for one operator. */
  activeFor(operator: string): number {
    return this.perOperator.get(operator) ?? 0
  }
}
