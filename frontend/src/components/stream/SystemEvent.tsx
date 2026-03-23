import type { SystemEvent as SystemEventType } from '@/types/ndjson'

export function SystemEvent({ event }: { event: SystemEventType }) {
  return (
    <div className="border-l-2 border-gray-600 pl-3 py-1">
      <span className="text-xs text-gray-500 font-mono">[system:{event.subtype}]</span>
    </div>
  )
}
