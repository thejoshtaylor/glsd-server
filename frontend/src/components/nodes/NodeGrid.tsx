import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { NodeCard } from './NodeCard'
import { Skeleton } from '@/components/ui/skeleton'
import type { NodeResponse } from '@/types/api'

export function NodeGrid() {
  const { data: nodes, isLoading, error } = useQuery({
    queryKey: ['nodes'],
    queryFn: () => api<NodeResponse[]>('/api/nodes'),
  })

  if (isLoading) return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="p-4 rounded-lg border border-border space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  )
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
