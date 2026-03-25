import { Badge } from '@/components/ui/badge'
import { Activity, Clock, AlertTriangle } from '@/lib/icons'
import type { LucideIcon } from 'lucide-react'

const statusConfig = {
  connected: {
    label: 'Connected',
    Icon: Activity,
    className: 'bg-[oklch(0.75_0.18_195/15%)] text-[oklch(0.75_0.18_195)] border-[oklch(0.75_0.18_195/30%)] shadow-[0_0_6px_1px_oklch(0.75_0.18_195/40%)]',
  },
  stale: {
    label: 'Stale',
    Icon: Clock,
    className: 'bg-[oklch(0.75_0.15_85/15%)] text-[oklch(0.75_0.15_85)] border-[oklch(0.75_0.15_85/30%)] shadow-[0_0_6px_1px_oklch(0.75_0.15_85/40%)]',
  },
  disconnected: {
    label: 'Disconnected',
    Icon: AlertTriangle,
    className: 'bg-[oklch(0.65_0.22_25/15%)] text-[oklch(0.65_0.22_25)] border-[oklch(0.65_0.22_25/30%)] shadow-[0_0_6px_1px_oklch(0.65_0.22_25/40%)]',
  },
} as const satisfies Record<string, { label: string; Icon: LucideIcon; className: string }>

export function NodeStatusBadge({ status }: { status: 'connected' | 'stale' | 'disconnected' }) {
  const config = statusConfig[status]
  return (
    <Badge variant="outline" className={`inline-flex items-center gap-1 ${config.className}`}>
      <config.Icon size={16} />
      {config.label}
    </Badge>
  )
}
