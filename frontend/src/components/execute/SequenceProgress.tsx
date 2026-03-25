import { useWsStore } from '@/stores/wsStore'
import { Button } from '@/components/ui/button'
import {
  Activity,
  Clock,
  CheckCircle,
  AlertTriangle,
  CircleDot,
  SkipForward,
} from '@/lib/icons'
import { GSD_COMMANDS } from '@/lib/gsdCommands'
import type { WsOutgoingMessage } from '@/types/protocol'

interface SequenceProgressProps {
  nodeId: string
}

export function SequenceProgress({ nodeId }: SequenceProgressProps) {
  const sequenceStates = useWsStore((s) => s.sequenceStates)
  const socket = useWsStore((s) => s.socket)
  const clearSequenceState = useWsStore((s) => s.clearSequenceState)

  // Find the most relevant sequence for this node (running > paused > done/error)
  const allForNode = Object.values(sequenceStates).filter((s) => s.node_id === nodeId)
  if (allForNode.length === 0) return null

  const seq =
    allForNode.find((s) => s.status === 'running') ??
    allForNode.find((s) => s.status === 'paused') ??
    allForNode[allForNode.length - 1]

  if (!seq) return null

  const sendWs = (msg: WsOutgoingMessage) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg))
    }
  }

  const statusIcon = () => {
    switch (seq.status) {
      case 'running':
        return <Activity size={14} className="text-green-400" />
      case 'paused':
        return <Clock size={14} className="text-yellow-400" />
      case 'done':
        return <CheckCircle size={14} className="text-green-400" />
      case 'error':
        return <AlertTriangle size={14} className="text-red-400" />
    }
  }

  const statusLabel = () => {
    switch (seq.status) {
      case 'running': return 'Running'
      case 'paused': return 'Paused'
      case 'done': return 'Done'
      case 'error': return 'Error'
    }
  }

  const getCommandLabel = (commandId: string) => {
    return GSD_COMMANDS.find((c) => c.id === commandId)?.label ?? commandId
  }

  return (
    <div className="p-4 bg-muted/50 rounded-lg border border-border space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          Sequence Progress
        </span>
        <div className="flex items-center gap-1.5">
          {statusIcon()}
          <span className="text-xs text-muted-foreground">{statusLabel()}</span>
        </div>
      </div>

      {/* Step list */}
      <div className="space-y-1">
        {Array.from({ length: seq.total_steps }, (_, i) => {
          const isCompleted =
            seq.status === 'done'
              ? true
              : i < seq.current_step
          const isActive = i === seq.current_step && seq.status === 'running'
          return (
            <div
              key={i}
              className={`flex items-center gap-2 text-xs py-0.5 ${
                isActive ? 'text-primary' : isCompleted ? 'text-muted-foreground' : 'text-muted-foreground/50'
              }`}
            >
              <span className="shrink-0">
                {isCompleted ? (
                  <CheckCircle size={12} className="text-green-400" />
                ) : isActive ? (
                  <CircleDot size={12} className="animate-pulse" />
                ) : (
                  <Clock size={12} />
                )}
              </span>
              <span className={`${isCompleted ? 'line-through' : ''}`}>
                {i + 1}. {getCommandLabel(seq.steps[i]?.command_id ?? '')}
              </span>
            </div>
          )
        })}
      </div>

      {/* Error reason */}
      {seq.status === 'error' && seq.error_reason && (
        <p className="text-xs text-red-400">{seq.error_reason}</p>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {seq.status === 'paused' && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-3 text-xs"
            onClick={() => sendWs({ type: 'advance_sequence', sequence_id: seq.sequence_id })}
          >
            <SkipForward size={12} className="mr-1" />
            Advance
          </Button>
        )}
        {(seq.status === 'done' || seq.status === 'error') && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-3 text-xs"
            onClick={() => clearSequenceState(seq.sequence_id)}
          >
            Dismiss
          </Button>
        )}
      </div>
    </div>
  )
}
