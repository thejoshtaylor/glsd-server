import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useWsStore } from '@/stores/wsStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Terminal, Play, ChevronDown } from '@/lib/icons'
import type { NodeResponse } from '@/types/api'
import type { WsOutgoingMessage } from '@/types/protocol'
import { VoiceButton } from './VoiceButton'
import { type RecorderState } from '@/hooks/useVoiceRecorder'

interface ExecuteFormProps {
  node: NodeResponse
  onInstanceCreated: (instanceId: string) => void
  defaultSessionId?: string
}

const PRESET_PROMPTS: { label: string; value: string; prompt: string }[] = [
  { label: 'Review code', value: 'review', prompt: 'Review the code in this project for bugs, style issues, and potential improvements.' },
  { label: 'Fix bugs', value: 'fix', prompt: 'Find and fix any bugs in this project. Explain each fix.' },
  { label: 'Write tests', value: 'write-tests', prompt: 'Write comprehensive tests for the existing code in this project.' },
  { label: 'Explain codebase', value: 'explain', prompt: 'Explain the architecture and key components of this codebase.' },
  { label: 'Custom prompt', value: 'custom', prompt: '' },
]

export function ExecuteForm({ node, onInstanceCreated, defaultSessionId }: ExecuteFormProps) {
  const [project, setProject] = useState(node.projects?.[0] ?? '')
  const [prompt, setPrompt] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [preset, setPreset] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)

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
    <div className="space-y-3 p-4 bg-muted/50 rounded-lg border border-border">
      <div className="text-sm font-medium text-muted-foreground uppercase tracking-widest inline-flex items-center gap-1.5">
        <Terminal size={20} className="text-primary" />
        Execute Command
      </div>

      <div className="space-y-4">
        {/* Field 1 — Project */}
        <div className="space-y-1">
          <label className="text-sm font-semibold">Project</label>
          <p className="text-sm text-muted-foreground">Which project should Claude work in?</p>
          {projects.length === 0 ? (
            <SelectTrigger disabled className="w-full opacity-50 cursor-not-allowed">
              <SelectValue placeholder="This node has no projects listed. Start the node and reconnect." />
            </SelectTrigger>
          ) : (
            <Select value={project} onValueChange={(val) => { if (val) setProject(val); }}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a project..." />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Field 2 — Quick Start preset */}
        <div className="space-y-1">
          <label className="text-sm font-semibold">Quick Start</label>
          <p className="text-sm text-muted-foreground">Choose a task or write your own below</p>
          <Select value={preset} onValueChange={(val) => { if (!val) return; setPreset(val); const entry = PRESET_PROMPTS.find(p => p.value === val); if (entry) setPrompt(entry.prompt); }}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a starting point..." />
            </SelectTrigger>
            <SelectContent>
              {PRESET_PROMPTS.map((item) => (
                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Field 3 — Prompt textarea */}
        <div className="space-y-1">
          <label className="text-sm font-semibold">What should Claude do?</label>
          <p className="text-sm text-muted-foreground">Describe the task in plain language — or choose a Quick Start above</p>
          <div className="relative">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the task..."
              rows={3}
              disabled={isTranscribing}
              className="w-full bg-muted border border-border text-foreground text-sm rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {isTranscribing && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/80 rounded-md">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>Transcribing...</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Field 4 — Advanced disclosure wrapping Session ID */}
        <details open={advancedOpen} onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}>
          <summary className="flex items-center gap-1 text-sm font-semibold cursor-pointer select-none text-muted-foreground hover:text-foreground">
            <ChevronDown size={14} className={`transition-transform duration-200 ${advancedOpen ? '' : '-rotate-90'}`} />
            Advanced
          </summary>
          <div className="mt-3">
            <label className="text-sm font-semibold">Session ID</label>
            <Input
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="Resume session ID (optional)"
              className="bg-muted border-border text-foreground text-sm mt-1"
            />
          </div>
        </details>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={() => executeMutation.mutate()}
          disabled={!canExecute || executeMutation.isPending || isAwaitingAck}
          className="flex-1"
        >
          {executeMutation.isPending ? 'Dispatching...' : isAwaitingAck ? 'Awaiting ACK...' : <><Play size={16} /> Run Task</>}
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
