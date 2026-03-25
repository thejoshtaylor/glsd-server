import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Activity, Clock, CheckCircle, AlertTriangle } from '@/lib/icons'
import type { LucideIcon } from 'lucide-react'
import type { InstanceResponse } from '@/types/api'

const instanceStatusConfig: Record<InstanceResponse['status'], { Icon: LucideIcon; className: string }> = {
  running: {
    Icon: Activity,
    className: 'bg-[oklch(0.75_0.18_195/15%)] text-[oklch(0.75_0.18_195)] border-[oklch(0.75_0.18_195/30%)] shadow-[0_0_6px_1px_oklch(0.75_0.18_195/40%)]',
  },
  pending: {
    Icon: Clock,
    className: 'bg-[oklch(0.75_0.15_85/15%)] text-[oklch(0.75_0.15_85)] border-[oklch(0.75_0.15_85/30%)] shadow-[0_0_6px_1px_oklch(0.75_0.15_85/40%)]',
  },
  finished: {
    Icon: CheckCircle,
    className: 'bg-muted/30 text-muted-foreground border-muted-foreground/20',
  },
  errored: {
    Icon: AlertTriangle,
    className: 'bg-[oklch(0.65_0.22_25/15%)] text-[oklch(0.65_0.22_25)] border-[oklch(0.65_0.22_25/30%)] shadow-[0_0_6px_1px_oklch(0.65_0.22_25/40%)]',
  },
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
      {instances.map((inst) => {
        const StatusIcon = instanceStatusConfig[inst.status].Icon
        return (
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
                    className="text-xs text-primary hover:text-primary/80 px-2 py-1 h-auto"
                    onClick={(e) => {
                      e.stopPropagation()
                      onResumeSession(inst.session_id!)
                    }}
                  >
                    Resume
                  </Button>
                )}
                <Badge variant="outline" className={`inline-flex items-center gap-1 ${instanceStatusConfig[inst.status].className}`}>
                  <StatusIcon size={16} />
                  {inst.status}
                </Badge>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
