/**
 * Causal graph over the 13 AI-readiness dimensions.
 *
 * When a what-if or a decision changes one dimension's score, the graph
 * propagates weighted effects to downstream dimensions
 * (e.g. D13 Infra → D5 AI Integration → D6 Human Interface).
 *
 * Edge weights follow the framework's factor↔dimension mapping and the
 * observed logical dependencies between dimensions.
 */

import { READINESS_DIMENSIONS, type DimensionScore, type ReadinessDimension } from '@sps/shared'

/** (sourceId, targetId, weight): a 1-point change in source moves target by weight. */
export const CAUSAL_EDGES: Array<[number, number, number]> = [
  [13, 5, 0.5], // D13 Infra → D5 AI Integration
  [13, 6, 0.3], // D13 Infra → D6 Human Interface
  [13, 11, 0.3], // D13 Infra → D11 Inclusion
  [1, 2, 0.4], // D1 Data Marketplace → D2 Generated Content
  [1, 3, 0.5], // D1 → D3 Cross-domain
  [1, 4, 0.3], // D1 → D4 Contextualization
  [3, 4, 0.4], // D3 Cross-domain → D4 Contextualization
  [7, 5, 0.4], // D7 Strategy → D5 AI Integration
  [7, 12, 0.5], // D7 Strategy → D12 Granular Priorities
  [7, 8, 0.3], // D7 Strategy → D8 Collaboration
  [10, 7, 0.5], // D10 AI & Policies → D7 Strategy
  [10, 8, 0.3], // D10 → D8 Collaboration
  [9, 8, 0.4], // D9 Human Impact → D8 Collaboration
  [9, 5, 0.3], // D9 → D5 AI Integration
  [5, 6, 0.4], // D5 → D6 Human Interface
  [5, 12, 0.3], // D5 → D12 Granular Priorities
  [2, 11, 0.3], // D2 Generated Content → D11 Inclusion
  [2, 6, 0.3], // D2 → D6 Human Interface
  [8, 5, 0.2], // D8 Collaboration → D5 AI Integration
  [11, 6, 0.3], // D11 Inclusion → D6 Human Interface
  [4, 12, 0.4], // D4 Contextualization → D12 Granular Priorities
]

const ID_TO_NAME: Record<number, ReadinessDimension> = Object.fromEntries(
  READINESS_DIMENSIONS.map((d) => [d.id, d.shortName]),
) as Record<number, ReadinessDimension>

const NAME_TO_ID: Record<ReadinessDimension, number> = Object.fromEntries(
  READINESS_DIMENSIONS.map((d) => [d.shortName, d.id]),
) as Record<ReadinessDimension, number>

/** Build adjacency: sourceId → [targetId, weight]. */
function buildAdjacency(): Map<number, Array<[number, number]>> {
  const adj = new Map<number, Array<[number, number]>>()
  for (const [src, tgt, weight] of CAUSAL_EDGES) {
    const list = adj.get(src) ?? []
    list.push([tgt, weight])
    adj.set(src, list)
  }
  return adj
}

const ADJACENCY = buildAdjacency()

/** Propagate numeric changes (keyed by dimension id). */
export function propagate(
  changes: Record<number, number>,
  { maxDepth = 3, decay = 0.5 }: { maxDepth?: number; decay?: number } = {},
): Record<number, number> {
  const accumulated: Record<number, number> = { ...changes }
  let frontier: Record<number, number> = { ...changes }

  for (let depth = 0; depth < maxDepth; depth += 1) {
    const next: Record<number, number> = {}
    for (const [dimId, delta] of Object.entries(frontier)) {
      for (const [successor, edgeWeight] of ADJACENCY.get(Number(dimId)) ?? []) {
        const effect = delta * edgeWeight * decay ** depth
        if (Math.abs(effect) < 0.01) continue
        next[successor] = (next[successor] ?? 0) + effect
      }
    }
    if (Object.keys(next).length === 0) break
    for (const [dimId, delta] of Object.entries(next)) {
      accumulated[Number(dimId)] = (accumulated[Number(dimId)] ?? 0) + delta
    }
    frontier = next
  }
  return accumulated
}

/**
 * Apply propagated changes to dimension scores (clamped to 0–5).
 * Changes are keyed by dimension short name for a stable public API.
 */
export function applyPropagation(
  scores: DimensionScore[],
  changes: Partial<Record<ReadinessDimension, number>>,
  options?: { maxDepth?: number; decay?: number },
): { projected: DimensionScore[]; effects: Partial<Record<ReadinessDimension, number>> } {
  const idChanges: Record<number, number> = {}
  for (const [name, delta] of Object.entries(changes)) {
    const id = NAME_TO_ID[name as ReadinessDimension]
    if (id != null && delta != null) idChanges[id] = delta
  }

  const propagated = propagate(idChanges, options)
  const byId = new Map(scores.map((s) => [s.dimensionId, s]))
  const projected: DimensionScore[] = []
  const effects: Partial<Record<ReadinessDimension, number>> = {}

  for (const def of READINESS_DIMENSIONS) {
    const original = byId.get(def.id)
    if (!original) continue
    const delta = propagated[def.id] ?? 0
    const isDirect = def.id in idChanges
    const newScore = Math.max(0, Math.min(5, original.score + delta))
    if (Math.abs(delta) > 0.01) effects[def.shortName] = Number(delta.toFixed(3))
    projected.push({
      ...original,
      score: Number(newScore.toFixed(2)),
      causalEffect: !isDirect && Math.abs(delta) > 0.01 ? Number(delta.toFixed(3)) : undefined,
      evidence:
        !isDirect && Math.abs(delta) > 0.01
          ? [...original.evidence, `Causal effect: ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`]
          : original.evidence,
    })
  }

  return { projected, effects }
}
