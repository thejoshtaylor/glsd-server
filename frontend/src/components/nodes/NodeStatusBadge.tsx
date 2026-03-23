import { Badge } from '@/components/ui/badge'

const statusConfig = {
  connected: { label: 'Connected', className: 'bg-green-600/20 text-green-400 border-green-600/30' },
  stale: { label: 'Stale', className: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30' },
  disconnected: { label: 'Disconnected', className: 'bg-red-600/20 text-red-400 border-red-600/30' },
} as const

export function NodeStatusBadge({ status }: { status: 'connected' | 'stale' | 'disconnected' }) {
  const config = statusConfig[status]
  return <Badge variant="outline" className={config.className}>{config.label}</Badge>
}
