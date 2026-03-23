import { Link } from '@tanstack/react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NodeStatusBadge } from './NodeStatusBadge'
import type { NodeResponse } from '@/types/api'
import { Monitor, Clock } from 'lucide-react'

export function NodeCard({ node }: { node: NodeResponse }) {
  const projectCount = node.projects?.length ?? 0
  const lastHeartbeat = node.last_heartbeat
    ? new Date(node.last_heartbeat).toLocaleTimeString()
    : 'Never'

  return (
    <Link to="/dashboard/$nodeId" params={{ nodeId: node.node_id }} className="block">
      <Card className="bg-gray-900 border-gray-800 hover:border-gray-700 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-white truncate">{node.node_id}</CardTitle>
            <NodeStatusBadge status={node.status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Monitor className="h-3 w-3" />
            <span>{node.platform} &middot; v{node.version}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>{projectCount} project{projectCount !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Clock className="h-3 w-3" />
            <span>Last ping: {lastHeartbeat}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
