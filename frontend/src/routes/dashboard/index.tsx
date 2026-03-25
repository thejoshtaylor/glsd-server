import { createFileRoute } from '@tanstack/react-router'
import { NodeGrid } from '@/components/nodes/NodeGrid'
import { NewNodeAlerts } from '@/components/alerts/NewNodeAlert'
import { Server } from '@/lib/icons'

export const Route = createFileRoute('/dashboard/')({
  component: DashboardPage,
})

function DashboardPage() {
  return (
    <div className="p-6 space-y-4 animate-in fade-in duration-150 fill-mode-both">
      <NewNodeAlerts />
      <h2 className="text-xl font-semibold text-foreground inline-flex items-center gap-2">
        <Server size={20} className="text-primary" />
        Nodes
      </h2>
      <NodeGrid />
    </div>
  )
}
