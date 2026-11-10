import { notFound } from 'next/navigation'
import { WorldView } from '@/components/world/world-view'
import { WORLD_MODE_ENABLED } from '@/lib/world-mode'

/**
 * World mode. The route exists only while the deployment keeps the flag on:
 * hiding the sidebar entry alone would leave a page nobody can discover and a
 * stale bookmark that still works.
 */
export default function WorldPage() {
  if (!WORLD_MODE_ENABLED) notFound()
  return <WorldView />
}
