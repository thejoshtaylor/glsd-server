import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { NodeCard } from './NodeCard'
import type { NodeResponse } from '@/types/api'

export function NodeGrid() {
  const { data: nodes, isLoading, error } = useQuery({
    queryKey: ['nodes'],
    queryFn: () => api<NodeResponse[]>('/api/nodes'),
  })

  if (isLoading) return <div className="text-muted-foreground p-6">Loading nodes...</div>
  if (error) return <div className="text-red-400 p-6">Failed to load nodes: {(error as Error).message}</div>
  if (!nodes?.length) return <div className="text-muted-foreground p-6">No nodes found. Assign nodes to your teams first.</div>

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {nodes.map((node) => (
        <NodeCard key={node.node_id} node={node} />
      ))}
    </div>
  )
}
