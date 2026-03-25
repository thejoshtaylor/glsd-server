import { useState } from 'react'
import { useWsStore } from '@/stores/wsStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Play,
  Square,
  Plus,
  Trash2,
  ArrowUp,
  ListOrdered,
} from '@/lib/icons'
import {
  GSD_COMMANDS,
  GSD_SEQUENCE_PRESETS,
  type GsdSequencePreset,
} from '@/lib/gsdCommands'
import type { WsOutgoingMessage } from '@/types/protocol'

interface StepState {
  command_id: string
  params: Record<string, string>
}

interface SequenceBuilderProps {
  nodeId: string
  project: string
  workDir: string
}

export function SequenceBuilder({ nodeId, project, workDir }: SequenceBuilderProps) {
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)
  const [steps, setSteps] = useState<StepState[]>([])
  const [showCommandPicker, setShowCommandPicker] = useState(false)

  const socket = useWsStore((s) => s.socket)
  const autoModeNodeIds = useWsStore((s) => s.autoModeNodeIds)
  const sequenceStates = useWsStore((s) => s.sequenceStates)
  const autoAdvance = autoModeNodeIds.includes(nodeId)

  // Find active sequence for cancel button
  const activeSequence = Object.values(sequenceStates).find(
    (s) => s.node_id === nodeId && (s.status === 'running' || s.status === 'paused')
  )

  const sendWs = (msg: WsOutgoingMessage) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg))
    }
  }

  const handlePresetClick = (preset: GsdSequencePreset) => {
    if (selectedPresetId === preset.id) {
      // Deselect
      setSelectedPresetId(null)
      setSteps([])
      return
    }
    setSelectedPresetId(preset.id)
    setSteps(
      preset.steps.map((s) => ({
        command_id: s.command_id,
        params: { ...(s.default_params ?? {}) },
      }))
    )
  }

  const handleAddStep = (commandId: string) => {
    setSteps((prev) => [...prev, { command_id: commandId, params: {} }])
    setShowCommandPicker(false)
    setSelectedPresetId(null)
  }

  const handleRemoveStep = (index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index))
    setSelectedPresetId(null)
  }

  const handleMoveUp = (index: number) => {
    if (index === 0) return
    setSteps((prev) => {
      const next = [...prev]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      return next
    })
    setSelectedPresetId(null)
  }

  const handleParamChange = (stepIndex: number, key: string, value: string) => {
    setSteps((prev) =>
      prev.map((s, i) =>
        i === stepIndex ? { ...s, params: { ...s.params, [key]: value } } : s
      )
    )
  }

  // Validate: all required params for every step must be filled
  const allParamsFilled = steps.every((step) => {
    const cmd = GSD_COMMANDS.find((c) => c.id === step.command_id)
    if (!cmd) return true
    return cmd.params.filter((p) => p.required).every((p) => (step.params[p.key] ?? '').trim().length > 0)
  })

  const canStart =
    steps.length > 0 &&
    allParamsFilled &&
    project.trim().length > 0 &&
    socket !== null &&
    socket.readyState === WebSocket.OPEN

  const handleStart = () => {
    if (!canStart) return
    sendWs({
      type: 'start_sequence',
      node_id: nodeId,
      project,
      work_dir: workDir,
      steps: steps.map((s) => ({ command_id: s.command_id, params: s.params })),
      auto_advance: autoAdvance,
    })
    setSteps([])
    setSelectedPresetId(null)
  }

  const handleCancel = () => {
    if (!activeSequence) return
    sendWs({ type: 'cancel_sequence', sequence_id: activeSequence.sequence_id })
  }

  return (
    <div className="space-y-3">
      {/* Preset selector */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <ListOrdered size={14} className="text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Preset Sequences
          </span>
        </div>
        <div className="space-y-1.5">
          {GSD_SEQUENCE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => handlePresetClick(preset)}
              className={`w-full text-left px-3 py-2 rounded-md border text-sm transition-colors ${
                selectedPresetId === preset.id
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-transparent border-border text-foreground hover:bg-muted/80'
              }`}
            >
              <div className="font-semibold">{preset.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{preset.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Step queue */}
      {steps.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Queue ({steps.length} step{steps.length !== 1 ? 's' : ''})
          </span>
          <div className="space-y-1.5">
            {steps.map((step, i) => {
              const cmd = GSD_COMMANDS.find((c) => c.id === step.command_id)
              return (
                <div key={i} className="rounded-md border border-border bg-muted/30 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <span className="text-xs text-muted-foreground w-4 shrink-0 font-mono">{i + 1}.</span>
                    <span className="text-sm font-semibold flex-1 text-foreground">
                      {cmd?.label ?? step.command_id}
                    </span>
                    <button
                      onClick={() => handleMoveUp(i)}
                      disabled={i === 0}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                      title="Move up"
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      onClick={() => handleRemoveStep(i)}
                      className="text-muted-foreground hover:text-red-400 transition-colors"
                      title="Remove step"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  {/* Param fields */}
                  {cmd && cmd.params.length > 0 && (
                    <div className="px-3 pb-3 pt-1 border-t border-border space-y-2 bg-muted/20">
                      {cmd.params.map((param) => (
                        <div key={param.key} className="space-y-1">
                          <label className="text-xs font-semibold text-foreground">
                            {param.label}
                            {param.required && <span className="text-primary ml-1">*</span>}
                          </label>
                          <Input
                            value={step.params[param.key] ?? ''}
                            onChange={(e) => handleParamChange(i, param.key, e.target.value)}
                            placeholder={param.placeholder}
                            className="bg-muted border-border text-foreground text-sm h-7"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Add step picker */}
      <div>
        {showCommandPicker ? (
          <div className="rounded-md border border-border bg-muted/30 overflow-hidden">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Add Step</span>
              <button
                onClick={() => setShowCommandPicker(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {GSD_COMMANDS.map((cmd) => (
                <button
                  key={cmd.id}
                  onClick={() => handleAddStep(cmd.id)}
                  className="w-full text-left px-3 py-1.5 hover:bg-muted/60 transition-colors"
                >
                  <span className="text-sm font-medium text-foreground">{cmd.label}</span>
                  <span className="text-xs text-muted-foreground ml-2">{cmd.category}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowCommandPicker(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus size={13} />
            Add step
          </button>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          onClick={handleStart}
          disabled={!canStart}
          className="flex-1 h-7 text-xs"
        >
          <Play size={12} className="mr-1" />
          Start Sequence
        </Button>
        {activeSequence && (
          <Button
            size="sm"
            variant="destructive"
            onClick={handleCancel}
            className="h-7 px-3 text-xs"
          >
            <Square size={12} className="mr-1" />
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}
