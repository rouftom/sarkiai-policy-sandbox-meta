/**
 * World mode visibility.
 *
 * The World route and its sidebar entry ship together; a deployment can hide
 * the entry (and 404 the route) with `NEXT_PUBLIC_WORLD_MODE=false` while the
 * rest of the console keeps working. Default on: the vertical slice is meant to
 * be visible.
 *
 * `NEXT_PUBLIC_` is inlined at build time, so this is a static value in the
 * client bundle; it is not a permission check, only a switch.
 */
export const WORLD_MODE_ENABLED = process.env.NEXT_PUBLIC_WORLD_MODE !== 'false'
