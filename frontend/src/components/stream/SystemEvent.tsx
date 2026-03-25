import type { SystemEvent as SystemEventType } from '@/types/ndjson'

export function SystemEvent({ event }: { event: SystemEventType }) {
  return (
    <div className="border-l-2 border-border pl-3 py-1">
      <span className="text-xs text-muted-foreground font-mono">[system:{event.subtype}]</span>
    </div>
  )
}
