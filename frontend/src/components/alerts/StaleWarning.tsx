import { AlertTriangle } from 'lucide-react'

export function StaleWarning({ nodeId }: { nodeId: string }) {
  return (
    <div className="flex items-center gap-2 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-md">
      <AlertTriangle className="h-4 w-4 text-yellow-400" />
      <span className="text-sm text-yellow-300">
        Node <span className="font-mono">{nodeId}</span> has not sent a heartbeat in over 90 seconds. It may be unresponsive.
      </span>
    </div>
  )
}
