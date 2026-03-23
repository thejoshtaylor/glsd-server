import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useWsStore } from '@/stores/wsStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { NodeResponse } from '@/types/api'
import type { WsOutgoingMessage } from '@/types/protocol'

interface ExecuteFormProps {
  node: NodeResponse
  onInstanceCreated: (instanceId: string) => void
  defaultSessionId?: string
}

export function ExecuteForm({ node, onInstanceCreated, defaultSessionId }: ExecuteFormProps) {
  const [project, setProject] = useState(node.projects?.[0] ?? '')
  const [prompt, setPrompt] = useState('')
  const [sessionId, setSessionId] = useState('')

  // Sync sessionId when defaultSessionId changes (resume session flow)
  useEffect(() => {
    if (defaultSessionId) {
      setSessionId(defaultSessionId)
    }
  }, [defaultSessionId])
  const [pendingInstanceId, setPendingInstanceId] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const socket = useWsStore((s) => s.socket)
  const instanceStatuses = useWsStore((s) => s.instanceStatuses)

  // Button stays disabled while POST is in-flight OR while instance is still 'pending' (awaiting node ACK)
  const pendingStatus = pendingInstanceId ? instanceStatuses[pendingInstanceId] : null
  const isAwaitingAck = pendingInstanceId != null && (pendingStatus === undefined || pendingStatus === 'pending')

  // Clear pendingInstanceId when instance transitions beyond 'pending'
  // (running, completed, errored all mean ACK was received or instance is done)
  if (pendingInstanceId && pendingStatus && pendingStatus !== 'pending') {
    setPendingInstanceId(null)
  }

  const executeMutation = useMutation({
    mutationFn: async () => {
      const result = await api<{ instance_id: string }>('/api/execute', {
        method: 'POST',
        body: JSON.stringify({
          node_id: node.node_id,
          project,
          work_dir: project, // work_dir defaults to project name
          prompt,
          session_id: sessionId || null,
        }),
      })
      return result
    },
    onSuccess: (data) => {
      // Track this instance as pending until ACK arrives via WS
      setPendingInstanceId(data.instance_id)

      // Subscribe to stream via WS
      if (socket && socket.readyState === WebSocket.OPEN) {
        const msg: WsOutgoingMessage = { type: 'subscribe', instance_id: data.instance_id }
        socket.send(JSON.stringify(msg))
      }
      onInstanceCreated(data.instance_id)
      queryClient.invalidateQueries({ queryKey: ['instances'] })
      setPrompt('')
      setSessionId('')
    },
  })

  const projects = node.projects ?? []
  const canExecute = project && prompt.trim() && node.status === 'connected'

  return (
    <div className="space-y-3 p-4 bg-gray-800/50 rounded-lg border border-gray-700/50">
      <div className="text-sm font-medium text-gray-300">Execute Command</div>

      <div className="flex gap-2">
        <select
          value={project}
          onChange={(e) => setProject(e.target.value)}
          className="flex-1 bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-md px-3 py-2"
        >
          {projects.length === 0 && <option value="">No projects</option>}
          {projects.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Enter prompt..."
        rows={3}
        className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
      />

      <Input
        value={sessionId}
        onChange={(e) => setSessionId(e.target.value)}
        placeholder="Resume session ID (optional)"
        className="bg-gray-800 border-gray-700 text-gray-200 text-sm"
      />

      <Button
        onClick={() => executeMutation.mutate()}
        disabled={!canExecute || executeMutation.isPending || isAwaitingAck}
        className="w-full"
      >
        {executeMutation.isPending ? 'Dispatching...' : isAwaitingAck ? 'Awaiting ACK...' : 'Execute'}
      </Button>

      {executeMutation.isError && (
        <p className="text-sm text-red-400">{executeMutation.error.message}</p>
      )}
    </div>
  )
}
