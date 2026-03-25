import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useWsStore } from '@/stores/wsStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Command, Rocket, Info } from '@/lib/icons'
import {
  GSD_COMMANDS,
  GSD_COMMAND_CATEGORIES,
  expandPrompt,
  type GsdCommandCategory,
} from '@/lib/gsdCommands'
import type { NodeResponse, ProjectResponse } from '@/types/api'
import type { WsOutgoingMessage } from '@/types/protocol'

interface CommandPaletteProps {
  node: NodeResponse
  onInstanceCreated: (instanceId: string) => void
}

export function CommandPalette({ node, onInstanceCreated }: CommandPaletteProps) {
  const [activeCategory, setActiveCategory] = useState<GsdCommandCategory>('Project')
  const [selectedCommandId, setSelectedCommandId] = useState<string | null>(null)
  const [paramValues, setParamValues] = useState<Record<string, string>>({})
  const [pendingInstanceId, setPendingInstanceId] = useState<string | null>(null)

  const queryClient = useQueryClient()
  const socket = useWsStore((s) => s.socket)
  const instanceStatuses = useWsStore((s) => s.instanceStatuses)

  const projectsQuery = useQuery({
    queryKey: ['projects', node.node_id],
    queryFn: () => api<ProjectResponse[]>(`/api/nodes/${node.node_id}/projects`),
  })

  const projectMap = Object.fromEntries(
    (projectsQuery.data ?? []).map((p) => [p.name, p.work_dir])
  )

  const dbProjectNames = (projectsQuery.data ?? []).map((p) => p.name)
  const nodeProjects = node.projects ?? []
  const allProjects = [...new Set([...nodeProjects, ...dbProjectNames])]
  const currentProject = allProjects[0] ?? ''
  const workDir = projectMap[currentProject] ?? currentProject

  // Button stays disabled while POST is in-flight OR while instance is still 'pending'
  const pendingStatus = pendingInstanceId ? instanceStatuses[pendingInstanceId] : null
  const isAwaitingAck = pendingInstanceId != null && (pendingStatus === undefined || pendingStatus === 'pending')

  // Clear pendingInstanceId when instance transitions beyond 'pending'
  if (pendingInstanceId && pendingStatus && pendingStatus !== 'pending') {
    setPendingInstanceId(null)
  }

  const selectedCommand = selectedCommandId
    ? GSD_COMMANDS.find((c) => c.id === selectedCommandId) ?? null
    : null

  const allRequiredParamsFilled = selectedCommand
    ? selectedCommand.params
        .filter((p) => p.required)
        .every((p) => (paramValues[p.key] ?? '').trim().length > 0)
    : true

  const canDispatch =
    currentProject !== '' &&
    node.status === 'connected' &&
    selectedCommand !== null &&
    allRequiredParamsFilled

  const dispatchMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const result = await api<{ instance_id: string }>('/api/execute', {
        method: 'POST',
        body: JSON.stringify({
          node_id: node.node_id,
          project: currentProject,
          work_dir: workDir,
          prompt,
          session_id: null,
        }),
      })
      return result
    },
    onSuccess: (data) => {
      setPendingInstanceId(data.instance_id)
      if (socket && socket.readyState === WebSocket.OPEN) {
        const msg: WsOutgoingMessage = { type: 'subscribe', instance_id: data.instance_id }
        socket.send(JSON.stringify(msg))
      }
      onInstanceCreated(data.instance_id)
      queryClient.invalidateQueries({ queryKey: ['instances'] })
      setSelectedCommandId(null)
      setParamValues({})
    },
  })

  const handleCommandClick = (commandId: string) => {
    const cmd = GSD_COMMANDS.find((c) => c.id === commandId)
    if (!cmd) return

    if (cmd.params.length === 0) {
      // No params — dispatch immediately if possible
      if (currentProject && node.status === 'connected') {
        dispatchMutation.mutate(cmd.promptTemplate)
      }
    } else {
      // Has params — expand inline form
      if (selectedCommandId === commandId) {
        setSelectedCommandId(null)
        setParamValues({})
      } else {
        setSelectedCommandId(commandId)
        setParamValues({})
      }
    }
  }

  const handleDispatch = () => {
    if (!selectedCommand || !canDispatch) return
    const expanded = expandPrompt(selectedCommand.promptTemplate, paramValues)
    dispatchMutation.mutate(expanded)
  }

  const filteredCommands = GSD_COMMANDS.filter((c) => c.category === activeCategory)

  return (
    <div className="space-y-3 p-4 bg-muted/50 rounded-lg border border-border">
      <div className="text-sm font-medium text-muted-foreground uppercase tracking-widest inline-flex items-center gap-1.5">
        <Command size={20} className="text-primary" />
        GSD Commands
      </div>

      {!currentProject && (
        <p className="text-xs text-muted-foreground">
          No project selected — connect a project to enable dispatch.
        </p>
      )}

      {/* Category tabs */}
      <div className="flex gap-1 flex-wrap">
        {GSD_COMMAND_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => {
              setActiveCategory(cat)
              setSelectedCommandId(null)
              setParamValues({})
            }}
            className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
              activeCategory === cat
                ? 'bg-primary/10 text-primary border-primary/30'
                : 'bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-foreground/30'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Command list */}
      <div className="space-y-1">
        {filteredCommands.map((cmd) => (
          <div key={cmd.id} className="rounded-md border border-border overflow-hidden">
            <button
              onClick={() => handleCommandClick(cmd.id)}
              className="w-full text-left px-3 py-2 hover:bg-muted/80 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-foreground">{cmd.label}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">{cmd.description}</p>
                </div>
                <span title={cmd.whenToUse} className="shrink-0">
                  <Info size={14} className="text-muted-foreground mt-0.5" />
                </span>
              </div>
            </button>

            {/* Inline param form */}
            {selectedCommandId === cmd.id && cmd.params.length > 0 && (
              <div className="px-3 pb-3 pt-2 border-t border-border space-y-2 bg-muted/30">
                {cmd.params.map((param) => (
                  <div key={param.key} className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">
                      {param.label}
                      {param.required && <span className="text-primary ml-1">*</span>}
                    </label>
                    <Input
                      value={paramValues[param.key] ?? ''}
                      onChange={(e) =>
                        setParamValues((prev) => ({ ...prev, [param.key]: e.target.value }))
                      }
                      placeholder={param.placeholder}
                      className="bg-muted border-border text-foreground text-sm h-7"
                    />
                  </div>
                ))}
                <Button
                  size="sm"
                  onClick={handleDispatch}
                  disabled={!canDispatch || dispatchMutation.isPending || isAwaitingAck}
                  className="mt-1"
                >
                  {dispatchMutation.isPending ? (
                    'Dispatching...'
                  ) : isAwaitingAck ? (
                    'Awaiting ACK...'
                  ) : (
                    <>
                      <Rocket size={14} className="mr-1" /> Dispatch
                    </>
                  )}
                </Button>
                {dispatchMutation.isError && (
                  <p className="text-xs text-red-400">{dispatchMutation.error.message}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
