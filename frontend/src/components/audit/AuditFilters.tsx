import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import type { NodeResponse } from '@/types/api'

interface AuditFiltersProps {
  nodes: NodeResponse[]
  selectedNodeId: string
  selectedType: string
  onNodeChange: (nodeId: string | null) => void
  onTypeChange: (type: string | null) => void
  isLoadingNodes: boolean
  nodesError: boolean
}

const EVENT_TYPES = [
  { value: 'all', label: 'All event types' },
  { value: 'execute', label: 'execute' },
  { value: 'kill', label: 'kill' },
  { value: 'instance_finished', label: 'instance_finished' },
  { value: 'instance_error', label: 'instance_error' },
]

export function AuditFilters({
  nodes,
  selectedNodeId,
  selectedType,
  onNodeChange,
  onTypeChange,
  isLoadingNodes,
  nodesError,
}: AuditFiltersProps) {
  if (nodesError) {
    return (
      <p className="text-sm text-red-400">
        Could not load nodes. Refresh the page to retry.
      </p>
    )
  }

  if (isLoadingNodes) {
    return (
      <div className="flex gap-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-48" />
      </div>
    )
  }

  return (
    <div className="flex gap-4">
      <div>
        <label className="sr-only" htmlFor="node-select">
          Filter by node
        </label>
        <Select
          value={selectedNodeId}
          onValueChange={onNodeChange}
          aria-label="Filter by node"
        >
          <SelectTrigger id="node-select" className="w-48">
            <SelectValue placeholder="Select node" />
          </SelectTrigger>
          <SelectContent>
            {nodes.length === 0 ? (
              <SelectItem value="_none" disabled>
                No nodes available
              </SelectItem>
            ) : (
              nodes.map((node) => (
                <SelectItem key={node.node_id} value={node.node_id}>
                  {node.node_id}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="sr-only" htmlFor="type-select">
          Filter by event type
        </label>
        <Select
          value={selectedType}
          onValueChange={onTypeChange}
          aria-label="Filter by event type"
        >
          <SelectTrigger id="type-select" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EVENT_TYPES.map((et) => (
              <SelectItem key={et.value} value={et.value}>
                {et.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
