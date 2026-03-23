import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import type { InstanceResponse } from '@/types/api'

const instanceStatusStyle: Record<InstanceResponse['status'], string> = {
  pending: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
  running: 'bg-green-600/20 text-green-400 border-green-600/30',
  finished: 'bg-gray-600/20 text-gray-400 border-gray-600/30',
  errored: 'bg-red-600/20 text-red-400 border-red-600/30',
}

interface InstanceListProps {
  nodeId: string
  onSelectInstance?: (instanceId: string) => void
}

export function InstanceList({ nodeId, onSelectInstance }: InstanceListProps) {
  const { data: instances, isLoading } = useQuery({
    queryKey: ['instances', { nodeId }],
    queryFn: () => api<InstanceResponse[]>(`/api/instances?node_id=${nodeId}`),
  })

  if (isLoading) return <div className="text-gray-400 text-sm">Loading instances...</div>
  if (!instances?.length) return <div className="text-gray-500 text-sm">No instances yet</div>

  return (
    <div className="space-y-2">
      {instances.map((inst) => (
        <div
          key={inst.instance_id}
          className={`flex items-center justify-between p-3 bg-gray-800/50 rounded-md border border-gray-700/50 ${onSelectInstance ? 'cursor-pointer hover:bg-gray-700/50 transition-colors' : ''}`}
          onClick={() => onSelectInstance?.(inst.instance_id)}
        >
          <div className="min-w-0 flex-1">
            <div className="text-sm text-gray-200 truncate">{inst.project}</div>
            <div className="text-xs text-gray-500 truncate">
              {inst.instance_id.slice(0, 8)}... &middot; {new Date(inst.created_at).toLocaleString()}
            </div>
            {inst.prompt && <div className="text-xs text-gray-400 truncate mt-1">{inst.prompt}</div>}
          </div>
          <Badge variant="outline" className={instanceStatusStyle[inst.status]}>{inst.status}</Badge>
        </div>
      ))}
    </div>
  )
}
