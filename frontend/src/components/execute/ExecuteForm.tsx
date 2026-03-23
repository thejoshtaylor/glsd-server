import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useWsStore } from '@/stores/wsStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { NodeResponse } from '@/types/api'
import type { WsOutgoingMessage } from '@/types/protocol'
import { VoiceButton } from './VoiceButton'
import { type RecorderState } from '@/hooks/useVoiceRecorder'

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
  const [isTranscribing, setIsTranscribing] = useState(false)
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

  const handleTranscript = (text: string) => {
    setPrompt(text)
    setIsTranscribing(false)
  }

  const handleVoiceStateChange = (state: RecorderState) => {
    setIsTranscribing(state === 'processing')
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

      <div className="relative">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter prompt..."
          rows={3}
          disabled={isTranscribing}
          className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {isTranscribing && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800/80 rounded-md">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>Transcribing...</span>
            </div>
          </div>
        )}
      </div>

      <Input
        value={sessionId}
        onChange={(e) => setSessionId(e.target.value)}
        placeholder="Resume session ID (optional)"
        className="bg-gray-800 border-gray-700 text-gray-200 text-sm"
      />

      <div className="flex gap-2">
        <Button
          onClick={() => executeMutation.mutate()}
          disabled={!canExecute || executeMutation.isPending || isAwaitingAck}
          className="flex-1"
        >
          {executeMutation.isPending ? 'Dispatching...' : isAwaitingAck ? 'Awaiting ACK...' : 'Execute'}
        </Button>
        <VoiceButton
          onTranscript={handleTranscript}
          onStateChange={handleVoiceStateChange}
          disabled={node.status !== 'connected'}
        />
      </div>

      {executeMutation.isError && (
        <p className="text-sm text-red-400">{executeMutation.error.message}</p>
      )}
    </div>
  )
}
