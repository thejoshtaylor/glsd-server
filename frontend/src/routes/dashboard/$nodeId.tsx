import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { NodeStatusBadge } from '@/components/nodes/NodeStatusBadge'
import { InstanceList } from '@/components/nodes/InstanceList'
import { ExecuteForm } from '@/components/execute/ExecuteForm'
import { StreamPanel } from '@/components/stream/StreamPanel'
import { HistoryStreamPanel } from '@/components/stream/HistoryStreamPanel'
import { StaleWarning } from '@/components/alerts/StaleWarning'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useWsStore } from '@/stores/wsStore'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { NodeResponse, InstanceResponse } from '@/types/api'
import type { WsOutgoingMessage } from '@/types/protocol'

export const Route = createFileRoute('/dashboard/$nodeId')({
  component: NodeDetailPage,
})

function NodeDetailPage() {
  const { nodeId } = Route.useParams()
  useWebSocket()

  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null)
  const [activeInstanceStatus, setActiveInstanceStatus] = useState<string>('pending')
  const [resumeSessionId, setResumeSessionId] = useState<string>('')
  const socket = useWsStore((s) => s.socket)
  const instanceStatuses = useWsStore((s) => s.instanceStatuses)

  const { data: node, isLoading, error } = useQuery({
    queryKey: ['node', nodeId],
    queryFn: () => api<NodeResponse>(`/api/nodes/${nodeId}`),
  })

  // Fetch active instance status from API if not in WS store
  const { data: activeInstance } = useQuery({
    queryKey: ['instance', activeInstanceId],
    queryFn: () => api<InstanceResponse>(`/api/instances/${activeInstanceId}`),
    enabled: !!activeInstanceId,
  })

  // Keep activeInstanceStatus in sync: prefer WS store (real-time), fallback to API
  useEffect(() => {
    if (!activeInstanceId) return
    const wsStatus = instanceStatuses[activeInstanceId]
    if (wsStatus) {
      setActiveInstanceStatus(wsStatus)
    } else if (activeInstance?.status) {
      setActiveInstanceStatus(activeInstance.status)
    }
  }, [activeInstanceId, instanceStatuses, activeInstance?.status])

  // Subscribe to stream when activeInstanceId changes
  useEffect(() => {
    if (!activeInstanceId || !socket || socket.readyState !== WebSocket.OPEN) return
    const msg: WsOutgoingMessage = { type: 'subscribe', instance_id: activeInstanceId }
    socket.send(JSON.stringify(msg))
  }, [activeInstanceId, socket])

  const handleInstanceCreated = (instanceId: string) => {
    setActiveInstanceId(instanceId)
    setActiveInstanceStatus('pending')
  }

  const handleSelectInstance = (instanceId: string) => {
    setActiveInstanceId(instanceId)
  }

  // Determine if we should show live stream or history
  const isLiveInstance = activeInstanceStatus === 'running' || activeInstanceStatus === 'pending'

  if (isLoading) return <div className="p-6 text-gray-400">Loading...</div>
  if (error || !node) return <div className="p-6 text-red-400">Node not found</div>

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 pb-4 space-y-4">
        <div className="flex items-center gap-4">
          <Link to="/dashboard">
            <Button variant="ghost" size="sm" className="text-gray-400">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </Link>
          <h2 className="text-xl font-semibold text-white">{node.node_id}</h2>
          <NodeStatusBadge status={node.status} />
        </div>

        {node.status === 'stale' && <StaleWarning nodeId={node.node_id} />}

        <div className="grid grid-cols-3 gap-4 text-sm">
          <div><span className="text-gray-500">Platform:</span> <span className="text-gray-200">{node.platform}</span></div>
          <div><span className="text-gray-500">Version:</span> <span className="text-gray-200">{node.version}</span></div>
          <div><span className="text-gray-500">Projects:</span> <span className="text-gray-200">{node.projects?.join(', ') || 'None'}</span></div>
        </div>
      </div>

      <div className="flex-1 min-h-0 px-6 pb-6">
        <ResizablePanelGroup direction="horizontal" className="h-full rounded-lg border border-gray-700">
          <ResizablePanel defaultSize={40} minSize={25}>
            <div className="flex flex-col h-full overflow-y-auto p-4 space-y-4">
              <ExecuteForm
                node={node}
                onInstanceCreated={handleInstanceCreated}
                defaultSessionId={resumeSessionId}
              />

              <div>
                <h3 className="text-sm font-medium text-gray-300 mb-2">Instances</h3>
                <InstanceList
                  nodeId={nodeId}
                  onSelectInstance={handleSelectInstance}
                  onResumeSession={setResumeSessionId}
                />
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel defaultSize={60} minSize={30}>
            <div className="h-full bg-gray-900/30">
              {activeInstanceId ? (
                isLiveInstance ? (
                  <StreamPanel
                    instanceId={activeInstanceId}
                    nodeId={nodeId}
                    instanceStatus={activeInstanceStatus}
                  />
                ) : (
                  <HistoryStreamPanel instanceId={activeInstanceId} />
                )
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                  Select or create an instance to view stream output
                </div>
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  )
}
