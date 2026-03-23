import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { StreamEventRenderer } from './StreamEventRenderer'
import type { StreamEventResponse } from '@/types/api'
import type { NdjsonEvent } from '@/types/ndjson'

interface HistoryStreamPanelProps {
  instanceId: string
}

export function HistoryStreamPanel({ instanceId }: HistoryStreamPanelProps) {
  const { data: events, isLoading, error } = useQuery({
    queryKey: ['stream-events', instanceId],
    queryFn: () => api<StreamEventResponse[]>(`/api/instances/${instanceId}/stream`),
  })

  if (isLoading) return <div className="p-3 text-gray-400 text-sm">Loading history...</div>
  if (error) return <div className="p-3 text-red-400 text-sm">Failed to load: {(error as Error).message}</div>
  if (!events?.length) return <div className="p-3 text-gray-500 text-sm">No output recorded</div>

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-gray-700 bg-gray-900/50">
        <div className="text-sm text-gray-300">
          History: <span className="text-gray-400 font-mono text-xs">{instanceId.slice(0, 12)}...</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {events.map((se) => (
          <StreamEventRenderer key={se.id} event={se.data as NdjsonEvent} />
        ))}
      </div>
    </div>
  )
}
