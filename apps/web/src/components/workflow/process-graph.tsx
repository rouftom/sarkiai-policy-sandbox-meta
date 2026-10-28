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
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  getBezierPath,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { AlertTriangle, CheckCircle2, Circle, Globe, Loader, Play, Rocket, Scale, Search, Sparkles } from 'lucide-react'
import { cn } from '@sps/ui'

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
  const StateIcon = data.state === 'success' ? CheckCircle2 : data.state === 'failed' ? AlertTriangle : data.state === 'running' ? Loader : Circle
  return (
    <div
      onClick={() => data.onSelect?.(id)}
      className={cn(
        'flex w-52 cursor-pointer items-center gap-2 rounded-xl border-2 bg-white px-2.5 py-2 text-left shadow-sm transition-colors dark:bg-brand-ink',
        STATE_RING[data.state],
        selected && 'ring-2 ring-brand-primary/40',
      )}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0" style={{ background: KIND_ACCENT[data.kind] }} />
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: `${KIND_ACCENT[data.kind]}22`, color: KIND_ACCENT[data.kind] }}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-semibold text-foreground">{data.label}</span>
        {data.detail && <span className="block truncate text-[10px] text-muted-foreground">{data.detail}</span>}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <StateIcon className={cn('h-3.5 w-3.5', data.state === 'running' && 'animate-spin', data.state === 'success' && 'text-emerald-600', data.state === 'failed' && 'text-destructive', data.state === 'running' && 'text-brand-primary')} />
        {data.duration && <span className="font-mono text-[9px] text-muted-foreground">{data.duration}</span>}
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
    const column = step.kind === 'start' ? 0 : step.kind === 'web' ? 1 : step.kind === 'agent' ? 2 : step.kind === 'synthesis' ? 3 : 4
    const row = step.kind === 'agent' ? agents.indexOf(step) : 0
    const centre = (agents.length - 1) / 2
    const y = step.kind === 'agent' ? (row - centre) * 62 : 0
    return {
      id: step.id,
      type: 'process',
      position: { x: column * 230, y },
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

export function ProcessGraph({ steps, onSelect, className }: { steps: ProcessGraphStep[]; onSelect?: (id: string) => void; className?: string }) {
  const handle = React.useCallback((id: string) => onSelect?.(id), [onSelect])
  const { nodes, edges } = React.useMemo(() => layout(steps, handle), [steps, handle])
  return (
    <div className={cn('h-[300px] w-full overflow-hidden rounded-2xl bg-secondary/40', className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
        minZoom={0.4}
        maxZoom={1.4}
      >
        <Background gap={18} size={1} color="#94a3b855" />
      </ReactFlow>
    </div>
  )
}
