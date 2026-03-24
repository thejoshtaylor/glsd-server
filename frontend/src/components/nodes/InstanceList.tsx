import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { InstanceResponse } from '@/types/api'

const instanceStatusStyle: Record<InstanceResponse['status'], string> = {
  pending: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
  running: 'bg-green-600/20 text-green-400 border-green-600/30',
  finished: 'bg-muted/20 text-muted-foreground border-border',
  errored: 'bg-red-600/20 text-red-400 border-red-600/30',
}

interface InstanceListProps {
  nodeId: string
  onSelectInstance?: (instanceId: string) => void
  onResumeSession?: (sessionId: string) => void
}

export function InstanceList({ nodeId, onSelectInstance, onResumeSession }: InstanceListProps) {
  const { data: instances, isLoading } = useQuery({
    queryKey: ['instances', { nodeId }],
    queryFn: () => api<InstanceResponse[]>(`/api/instances?node_id=${nodeId}`),
  })

  if (isLoading) return <div className="text-muted-foreground text-sm">Loading instances...</div>
  if (!instances?.length) return <div className="text-muted-foreground text-sm">No instances yet</div>

  return (
    <div className="space-y-2">
      {instances.map((inst) => (
        <div
          key={inst.instance_id}
          className={`p-3 bg-muted/50 rounded-md border border-border ${onSelectInstance ? 'cursor-pointer hover:bg-muted transition-colors' : ''}`}
          onClick={() => onSelectInstance?.(inst.instance_id)}
        >
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <div className="text-sm text-foreground truncate">{inst.project}</div>
              <div className="text-xs text-muted-foreground font-mono truncate">
                {inst.instance_id.slice(0, 8)}... &middot; {new Date(inst.created_at).toLocaleString()}
              </div>
              {inst.prompt && <div className="text-xs text-muted-foreground truncate mt-1">{inst.prompt}</div>}
              {inst.error && (
                <div className="text-xs text-red-400 mt-1">{inst.error}</div>
              )}
            </div>
            <div className="flex items-center gap-2 ml-2 flex-shrink-0">
              {(inst.status === 'finished' || inst.status === 'errored') && inst.session_id && onResumeSession && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 h-auto"
                  onClick={(e) => {
                    e.stopPropagation()
                    onResumeSession(inst.session_id!)
                  }}
                >
                  Resume
                </Button>
              )}
              <Badge variant="outline" className={instanceStatusStyle[inst.status]}>{inst.status}</Badge>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
