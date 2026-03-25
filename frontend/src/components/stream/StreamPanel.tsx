import { useWsStore } from '@/stores/wsStore'
import { useAutoScroll } from '@/hooks/useAutoScroll'
import { StreamEventRenderer } from './StreamEventRenderer'
import { KillButton } from '@/components/execute/KillButton'
import type { NdjsonEvent } from '@/types/ndjson'
import { ArrowDown } from '@/lib/icons'

interface StreamPanelProps {
  instanceId: string
  nodeId: string
  instanceStatus: string
}

export function StreamPanel({ instanceId, nodeId, instanceStatus }: StreamPanelProps) {
  const events: NdjsonEvent[] = useWsStore((s) => s.streamBuffers[instanceId] ?? [])
  const { containerRef, userScrolledUp, resetScroll } = useAutoScroll([events.length])

  const isRunning = instanceStatus === 'running' || instanceStatus === 'pending'

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex items-center justify-between p-3 border-b border-border bg-card/50">
        <div className="text-sm text-muted-foreground uppercase tracking-widest">
          Stream: <span className="text-muted-foreground font-mono text-xs">{instanceId.slice(0, 12)}...</span>
          {isRunning && <span className="live-dot ml-2" aria-hidden="true" />}
        </div>
        <div className="flex items-center gap-2">
          {isRunning && (
            <KillButton nodeId={nodeId} instanceId={instanceId} />
          )}
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-y-auto p-3 space-y-1">
        {events.length === 0 && (
          <div className="text-muted-foreground text-sm">Waiting for output...</div>
        )}
        {events.map((event, i) => (
          <StreamEventRenderer key={i} event={event} />
        ))}
      </div>

      {userScrolledUp && (
        <button
          onClick={resetScroll}
          className="absolute bottom-4 right-4 bg-primary hover:bg-primary/80 text-primary-foreground rounded-full p-2 shadow-lg glow-cyan"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
