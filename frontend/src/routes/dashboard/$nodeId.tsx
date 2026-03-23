import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { NodeStatusBadge } from '@/components/nodes/NodeStatusBadge'
import { InstanceList } from '@/components/nodes/InstanceList'
import { useWebSocket } from '@/hooks/useWebSocket'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { NodeResponse } from '@/types/api'

export const Route = createFileRoute('/dashboard/$nodeId')({
  component: NodeDetailPage,
})

function NodeDetailPage() {
  const { nodeId } = Route.useParams()
  useWebSocket()

  const { data: node, isLoading, error } = useQuery({
    queryKey: ['node', nodeId],
    queryFn: () => api<NodeResponse>(`/api/nodes/${nodeId}`),
  })

  if (isLoading) return <div className="p-6 text-gray-400">Loading...</div>
  if (error || !node) return <div className="p-6 text-red-400">Node not found</div>

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/dashboard">
          <Button variant="ghost" size="sm" className="text-gray-400">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        </Link>
        <h2 className="text-xl font-semibold text-white">{node.node_id}</h2>
        <NodeStatusBadge status={node.status} />
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm">
        <div><span className="text-gray-500">Platform:</span> <span className="text-gray-200">{node.platform}</span></div>
        <div><span className="text-gray-500">Version:</span> <span className="text-gray-200">{node.version}</span></div>
        <div><span className="text-gray-500">Projects:</span> <span className="text-gray-200">{node.projects?.join(', ') || 'None'}</span></div>
      </div>

      <div>
        <h3 className="text-lg font-medium text-white mb-3">Instances</h3>
        <InstanceList nodeId={nodeId} />
      </div>
    </div>
  )
}
