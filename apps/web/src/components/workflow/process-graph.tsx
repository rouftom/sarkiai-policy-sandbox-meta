'use client'

/**
 * A read-only React Flow canvas of a process: one node per step, labelled ports,
 * state colours and durations, the look of the organization workflow editor.
 * It shows a live run (nodes update as events arrive) or a finished one.
 * Editing (drag and drop, save, publish) is not part of this canvas.
 */

import * as React from 'react'
import {
  Background,
  BaseEdge,
  Controls,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  useReactFlow,
  useStore,
  getBezierPath,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { AlertTriangle, CheckCircle2, Circle, Globe, Loader, Play, Rocket, Scale, Sparkles } from 'lucide-react'
import { Select, cn } from '@sps/ui'

export type ProcessState = 'idle' | 'running' | 'success' | 'failed'
export type ProcessKind = 'start' | 'web' | 'agent' | 'synthesis' | 'saved'

export interface ProcessNodeData extends Record<string, unknown> {
  kind: ProcessKind
  label: string
  state: ProcessState
  detail?: string
  duration?: string
  onSelect?: (id: string) => void
}

type ProcessFlowNode = Node<ProcessNodeData, 'process'>

const KIND_ICON = { start: Play, web: Globe, agent: Scale, synthesis: Sparkles, saved: Rocket } as const
const KIND_ACCENT: Record<ProcessKind, string> = {
  start: '#0f766e',
  web: '#0284c7',
  agent: '#7c3aed',
  synthesis: '#b45309',
  saved: '#047857',
}
const STATE_RING: Record<ProcessState, string> = {
  idle: 'border-slate-300/70 dark:border-slate-600/60',
  running: 'border-brand-primary dark:border-brand-primary-light',
  success: 'border-emerald-500/70',
  failed: 'border-destructive',
}

function ProcessNodeComponent({ id, data, selected }: NodeProps<ProcessFlowNode>) {
  const Icon = KIND_ICON[data.kind]
  const active = data.state === 'running'
  const StateIcon = data.state === 'success' ? CheckCircle2 : data.state === 'failed' ? AlertTriangle : data.state === 'running' ? Loader : Circle
  return (
    <div
      onClick={() => data.onSelect?.(id)}
      className={cn(
        'flex w-64 cursor-pointer items-center gap-3 rounded-2xl border-2 px-3.5 py-3 text-left shadow-sm transition-colors hover:shadow-md',
        active ? 'border-brand-primary bg-brand-primary shadow-md' : 'bg-white dark:bg-brand-ink',
        !active && STATE_RING[data.state],
        selected && 'ring-2 ring-brand-primary/40',
      )}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0" style={{ background: KIND_ACCENT[data.kind] }} />
      <span
        className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl', active && 'bg-white/20')}
        style={active ? undefined : { backgroundColor: `${KIND_ACCENT[data.kind]}22`, color: KIND_ACCENT[data.kind] }}
      >
        <Icon className={cn('h-4 w-4', active && 'text-white')} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-[13px] font-bold', active ? 'text-white' : 'text-foreground')}>{data.label}</span>
        {data.detail && (
          <span className={cn('block truncate text-[11px] font-semibold', active ? 'text-white/90' : 'text-brand-primary-dark dark:text-brand-primary-light')}>
            {data.detail}
          </span>
        )}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <StateIcon
          className={cn(
            'h-3.5 w-3.5',
            data.state === 'running' && 'animate-spin text-white',
            data.state === 'success' && 'text-emerald-600',
            data.state === 'failed' && 'text-destructive',
          )}
        />
        {data.duration && <span className={cn('font-mono text-[9px]', active ? 'text-white/90' : 'text-muted-foreground')}>{data.duration}</span>}
      </span>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0" style={{ background: KIND_ACCENT[data.kind] }} />
    </div>
  )
}

function ProcessEdgeComponent({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd }: EdgeProps) {
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const active = Boolean((data as { active?: boolean } | undefined)?.active)
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: active ? '#0f766e' : '#94a3b8', strokeWidth: active ? 2 : 1.25, strokeDasharray: active ? '6 4' : undefined, animation: active ? 'dash 0.8s linear infinite' : undefined }} />
    </>
  )
}

const nodeTypes = { process: ProcessNodeComponent }
const edgeTypes = { process: ProcessEdgeComponent }

export interface ProcessGraphStep {
  id: string
  kind: ProcessKind
  label: string
  state: ProcessState
  detail?: string
  duration?: string
  /** Edges into this node come from these step ids. Defaults to the previous step. */
  from?: string[]
}

/** Lays steps out in columns; agent steps stack vertically in the middle column. */
function layout(steps: ProcessGraphStep[], onSelect: (id: string) => void): { nodes: ProcessFlowNode[]; edges: Edge[] } {
  const agents = steps.filter((step) => step.kind === 'agent')
  const nodes: ProcessFlowNode[] = steps.map((step) => {
    // Column left edges: wider gaps before and after the dimensions column, which holds the most nodes.
    const x = step.kind === 'start' ? 0 : step.kind === 'web' ? 360 : step.kind === 'agent' ? 820 : step.kind === 'synthesis' ? 1340 : 1700
    const row = step.kind === 'agent' ? agents.indexOf(step) : 0
    const centre = (agents.length - 1) / 2
    const y = step.kind === 'agent' ? (row - centre) * 96 : 0
    return {
      id: step.id,
      type: 'process',
      position: { x, y },
      data: { kind: step.kind, label: step.label, state: step.state, detail: step.detail, duration: step.duration, onSelect },
      draggable: false,
      selectable: true,
    }
  })
  const edges: Edge[] = []
  steps.forEach((step, index) => {
    const sources = step.from ?? (index > 0 && step.kind !== 'start' ? [steps[index - 1]!.id] : [])
    for (const source of sources) {
      const from = steps.find((candidate) => candidate.id === source)
      const active = from?.state === 'success' && step.state === 'running'
      edges.push({
        id: `${source}->${step.id}`,
        source,
        target: step.id,
        type: 'process',
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: active ? '#0f766e' : '#94a3b8' },
        data: { active },
      })
    }
  })
  return { nodes, edges }
}

/** Whether two renders describe the same node (same place, same content). */
function sameNode(a: ProcessFlowNode, b: ProcessFlowNode): boolean {
  return (
    a.position.x === b.position.x &&
    a.position.y === b.position.y &&
    a.data.kind === b.data.kind &&
    a.data.label === b.data.label &&
    a.data.state === b.data.state &&
    a.data.detail === b.data.detail &&
    a.data.duration === b.data.duration &&
    a.data.onSelect === b.data.onSelect
  )
}

/**
 * The view selector, "Réorganiser", and the only place that frames the canvas: once the
 * nodes are measured, when the view changes, when the node set changes, and when the
 * canvas resizes.
 *
 * A `fitView` called before the nodes have a size computes the viewport from empty
 * bounds: the result is an off-screen (or infinite) transform that leaves the canvas
 * blank until something frames it again. Every call here is therefore gated on the
 * nodes being measured and on the canvas having a real size, and the view filter is
 * reduced to the nodes that exist so it can never be empty.
 */
function ViewportControls({
  target,
  views,
  view,
  onView,
  viewLabel,
  stepIds,
}: {
  target: React.RefObject<HTMLDivElement | null>
  views?: ProcessGraphView[]
  view: string
  onView: (id: string) => void
  viewLabel?: string
  /** The ids of the nodes on the canvas, `|`-joined so the effects only rerun on a real change. */
  stepIds: string
}) {
  const { fitView, getViewport, setViewport } = useReactFlow()
  /**
   * `useNodesInitialized` only flips when the node set is written again, so a canvas
   * whose nodes never change identity (as ours, cached) never reports itself measured
   * and never gets framed. Reading the measured sizes straight from the store follows
   * every measurement pass instead.
   */
  const measured = useStore((state) => {
    const nodes = Array.from(state.nodeLookup.values())
    return nodes.length > 0 && nodes.every((node) => Boolean(node.measured?.width && node.measured?.height))
  })
  const viewKey = (views?.find((entry) => entry.id === view)?.nodes ?? []).join('|')
  // Nothing is fitted until the nodes are measured (there is nothing to fit yet).
  const ready = React.useRef(false)

  const frame = React.useCallback(
    async (duration = 300) => {
      const element = target.current
      if (!ready.current || !element || element.clientWidth < 8 || element.clientHeight < 8) return
      const known = new Set(stepIds.split('|'))
      const wanted = viewKey ? viewKey.split('|').filter((id) => known.has(id)) : []
      await fitView({ padding: 0.2, duration, ...(wanted.length > 0 ? { nodes: wanted.map((id) => ({ id })) } : {}) })
      // A viewport computed on nothing is not finite (or sits at zoom zero): put the canvas back on a sane frame.
      const { x, y, zoom } = getViewport()
      if (![x, y, zoom].every(Number.isFinite) || zoom <= 0) {
        void setViewport({ x: 24, y: 24, zoom: 0.7 })
      }
    },
    [fitView, getViewport, setViewport, stepIds, target, viewKey],
  )

  /**
   * Frames the canvas the first time the nodes are measured, then again on a view change
   * or when the node set changes (a lane appears, a dimension is added). The signature
   * keeps progress ticks from reframing, and waiting for `measured` means a node that has
   * just joined the canvas is framed with the others instead of being left out.
   */
  const signature = `${viewKey}#${stepIds}`
  const framed = React.useRef(false)
  const lastSignature = React.useRef(signature)
  React.useEffect(() => {
    if (!measured) return
    ready.current = true
    if (framed.current && lastSignature.current === signature) return
    framed.current = true
    lastSignature.current = signature
    void frame()
  }, [frame, measured, signature])

  // The tab opens, the window resizes: frame again once the canvas has its new size.
  const lastSize = React.useRef('')
  React.useEffect(() => {
    const element = target.current
    if (!element || typeof ResizeObserver === 'undefined') return
    let timer = 0
    const observer = new ResizeObserver(() => {
      const size = `${element.clientWidth}x${element.clientHeight}`
      if (size === lastSize.current) return
      lastSize.current = size
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void frame(200), 120)
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
    }
  }, [frame, target])

  return (
    <Panel position="top-right" className="flex items-center gap-2">
      {views && views.length > 0 && (
        <Select
          ariaLabel={viewLabel ?? 'View'}
          value={view}
          onValueChange={onView}
          options={views.map((entry) => ({ value: entry.id, label: entry.label }))}
          size="sm"
          triggerClassName="!h-7 text-[10px]"
          className="w-44"
        />
      )}
      <button
        type="button"
        onClick={() => void frame()}
        className="h-7 rounded-lg border border-border bg-card/90 px-2.5 text-[10px] font-semibold text-foreground shadow-sm transition-colors hover:bg-secondary"
      >
        Réorganiser
      </button>
    </Panel>
  )
}

/** A group of nodes the selector can frame. Without `nodes`, the whole process. */
export interface ProcessGraphView {
  id: string
  label: string
  nodes?: string[]
}

const POPOVER_WIDTH = 320
const POPOVER_HEIGHT = 380

/**
 * The canvas. A click on a node opens `renderPopover` next to the node, as a
 * dropdown does: no overlay, closed by a click on the canvas or Escape.
 */
export function ProcessGraph({
  steps,
  onSelect,
  renderPopover,
  className,
  views,
  viewLabel,
  summary,
}: {
  steps: ProcessGraphStep[]
  onSelect?: (id: string) => void
  renderPopover?: (id: string, close: () => void) => React.ReactNode
  className?: string
  views?: ProcessGraphView[]
  viewLabel?: string
  /** Plain text in the bottom right corner of the canvas. */
  summary?: React.ReactNode
}) {
  const container = React.useRef<HTMLDivElement>(null)
  const [view, setView] = React.useState<string>(views?.[0]?.id ?? '')
  const stepIds = steps.map((step) => step.id).join('|')
  const [anchor, setAnchor] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const close = React.useCallback(() => setAnchor(null), [])
  const handle = React.useCallback((id: string) => onSelect?.(id), [onSelect])
  /**
   * React Flow compares nodes by object identity: a node given again as a new object is
   * adopted from scratch, which drops its measured size and hides it until it is measured
   * again. Rebuilding every node on every progress tick therefore blinks the whole canvas.
   * The cache hands back the previous object while a node's content is unchanged.
   */
  const nodeCache = React.useRef(new Map<string, ProcessFlowNode>())
  const { nodes, edges } = React.useMemo(() => {
    const next = layout(steps, handle)
    const cache = nodeCache.current
    const seen = new Set<string>()
    const nodes = next.nodes.map((node) => {
      seen.add(node.id)
      const previous = cache.get(node.id)
      const stable = previous && sameNode(previous, node) ? previous : node
      cache.set(node.id, stable)
      return stable
    })
    for (const id of cache.keys()) if (!seen.has(id)) cache.delete(id)
    return { nodes, edges: next.edges }
  }, [steps, handle])

  React.useEffect(() => {
    if (!anchor) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [anchor, close])

  const place = (x: number, y: number) => {
    const width = container.current?.clientWidth ?? 800
    const height = container.current?.clientHeight ?? 520
    return {
      left: Math.max(8, Math.min(x + 14, width - POPOVER_WIDTH - 8)),
      top: Math.max(8, Math.min(y + 14, height - POPOVER_HEIGHT - 8)),
    }
  }

  return (
    <div ref={container} className={cn('sps-flow relative h-[520px] w-full overflow-hidden rounded-2xl bg-secondary/40', className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(event, node) => {
          const rect = container.current?.getBoundingClientRect()
          const x = event.clientX - (rect?.left ?? 0)
          const y = event.clientY - (rect?.top ?? 0)
          setAnchor({ id: node.id, x, y })
          handle(node.id)
        }}
        onPaneClick={close}
        onMoveStart={close}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={1.4}
      >
        <Background gap={18} size={1} color="#94a3b855" />
        <Controls showInteractive={false} position="bottom-left" className="!shadow-sm" />
        <ViewportControls target={container} views={views} view={view} onView={setView} viewLabel={viewLabel} stepIds={stepIds} />
      </ReactFlow>
      {summary && (
        <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex items-center gap-2 text-[11px] text-muted-foreground">
          {summary}
        </div>
      )}
      {anchor && renderPopover && (
        <div
          role="dialog"
          aria-label={anchor.id}
          className="absolute z-30 flex max-h-[380px] w-80 flex-col overflow-hidden rounded-2xl bg-card shadow-xl ring-1 ring-black/5 dark:ring-white/10"
          style={place(anchor.x, anchor.y)}
        >
          {renderPopover(anchor.id, close)}
        </div>
      )}
    </div>
  )
}
