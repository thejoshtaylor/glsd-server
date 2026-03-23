import { useWsStore } from '@/stores/wsStore'
import { X, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function NewNodeAlerts() {
  const alerts = useWsStore((s) => s.newNodeAlerts)
  const dismissAlert = useWsStore((s) => s.dismissAlert)

  if (alerts.length === 0) return null

  return (
    <div className="space-y-2 mb-4">
      {alerts.map((nodeId) => (
        <div key={nodeId} className="flex items-center justify-between p-3 bg-blue-900/30 border border-blue-700/50 rounded-md">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-blue-400" />
            <span className="text-sm text-blue-300">
              New node connected: <span className="font-mono">{nodeId}</span>
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => dismissAlert(nodeId)} className="text-blue-400 hover:text-blue-300">
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  )
}
