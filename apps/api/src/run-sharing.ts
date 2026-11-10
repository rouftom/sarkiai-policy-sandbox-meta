/**
 * Sharing state of a saved run summary.
 *
 * Reports were never shared; summaries are, on the country dashboard and in
 * World summaries. An operator can exclude one of their runs: it then leaves
 * the shared scope, other operators' country insights and World aggregates,
 * while the owner keeps seeing it in their own history.
 */

export type RunSharing = 'shared' | 'excluded'

/**
 * What one operator may read: their own runs (`mine`) or every summary another
 * operator did not exclude (`shared`). Used by the country dashboard and the
 * World summary.
 */
export type RunScope = 'mine' | 'shared'

/**
 * Mongo filter clause matching what `viewer` may see: every shared run, plus
 * their own excluded ones.
 */
export function sharingClause(viewer: string): Record<string, unknown> {
  return { $or: [{ sharing: { $ne: 'excluded' } }, { userId: viewer }] }
}

/** Memory back end counterpart of `sharingClause`. */
export function isSharedWith(run: { sharing?: RunSharing; userId: string }, viewer: string): boolean {
  return run.sharing !== 'excluded' || run.userId === viewer
}
