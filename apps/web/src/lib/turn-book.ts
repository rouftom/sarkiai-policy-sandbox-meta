/** Dependency-free: the transcript is built from turns, so it can be tested on its own. */

/**
 * Keeps the transcript by turn. The service numbers utterances (`turnId`) and
 * may overlap them; a finished turn is final and later partials cannot change
 * it, so nothing is repeated. Partials carry no turn id: they belong to the
 * turn opened by the latest `speechStart`.
 */
export class TurnBook {
  private turns = new Map<number, { text: string; done: boolean }>()
  private open: number | null = null
  private next = 1

  start(turnId: number) {
    if (!this.turns.has(turnId)) this.turns.set(turnId, { text: '', done: false })
    this.open = turnId
  }

  partial(text: string) {
    if (this.open === null && this.echoesLastTurn(text)) return
    const turnId = this.open ?? this.next
    const turn = this.turns.get(turnId)
    if (turn?.done) return
    if (!turn) this.turns.set(turnId, { text, done: false })
    else turn.text = text
    this.open = turnId
    this.next = Math.max(this.next, turnId + 1)
  }

  /** A partial with no open turn that repeats the turn just finished is a late echo, not new speech. */
  private echoesLastTurn(text: string): boolean {
    const last = [...this.turns.entries()].filter(([, turn]) => turn.done).sort(([a], [b]) => b - a)[0]?.[1]
    if (!last?.text) return false
    const norm = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    const echo = norm(text)
    const done = norm(last.text)
    return Boolean(echo) && (done.includes(echo) || echo.includes(done))
  }

  complete(turnId: number, text: string) {
    this.turns.set(turnId, { text: text.trim(), done: true })
    if (this.open === turnId) this.open = null
    this.next = Math.max(this.next, turnId + 1)
  }

  text(): string {
    return [...this.turns.keys()]
      .sort((a, b) => a - b)
      .map((key) => this.turns.get(key)?.text ?? '')
      .filter(Boolean)
      .join(' ')
  }
}

