import { useState } from 'react'
import { useWsStore } from '@/stores/wsStore'
import { api } from '@/lib/api'
import type { InstanceResponse } from '@/types/api'
import type { ToolUseEvent } from '@/types/ndjson'
import { MessageCircleQuestion, Send, Check } from '@/lib/icons'

interface InteractiveResponseUIProps {
  instanceId: string
  nodeId: string
}

interface AskQuestion {
  question: string
  header: string
  multiSelect: boolean
  options: Array<{ label: string; description: string }>
}

export function InteractiveResponseUI({ instanceId }: InteractiveResponseUIProps) {
  const instanceStatus = useWsStore((s) => s.instanceStatuses[instanceId])
  const promptState = useWsStore((s) => s.promptStates[instanceId])
  const events = useWsStore((s) => s.streamBuffers[instanceId] ?? [])
  const socket = useWsStore((s) => s.socket)

  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set())
  const [freeformText, setFreeformText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // CRITICAL nil-guard — never render for terminated instances or answered prompts
  if (!instanceStatus || instanceStatus === 'finished' || instanceStatus === 'errored') return null
  if (promptState === 'answered') return null
  if (!promptState) return null

  // Find the last AskUserQuestion tool_use event in the buffer
  let askEvent: ToolUseEvent | undefined
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]
    if (ev.type === 'tool_use' && (ev as ToolUseEvent).name === 'AskUserQuestion') {
      askEvent = ev as ToolUseEvent
      break
    }
  }

  // Determine mode: AskUserQuestion or freeform
  const isFreeform = !askEvent && promptState === 'pending'
  if (!askEvent && !isFreeform) return null

  const askInput = askEvent?.input as {
    questions: AskQuestion[]
  } | undefined
  const question = askInput?.questions?.[0]

  const isDisabled = promptState === 'claimed_by_other' || submitting

  async function handleSubmit(promptText: string) {
    if (!socket || !promptText.trim()) return
    setSubmitting(true)
    try {
      // Send claim_prompt — server will broadcast prompt_claimed which updates promptState
      socket.send(JSON.stringify({ type: 'claim_prompt', instance_id: instanceId }))

      // Fetch session_id from REST API
      const instance = await api<InstanceResponse>(`/api/instances/${instanceId}`)
      if (!instance.session_id) {
        console.error('InteractiveResponseUI: session_id is null for instance', instanceId)
        setSubmitting(false)
        return
      }

      // Dispatch submit_answer via WS
      socket.send(JSON.stringify({
        type: 'submit_answer',
        instance_id: instanceId,
        prompt: promptText,
        session_id: instance.session_id,
      }))
    } catch (err) {
      console.error('InteractiveResponseUI: submit failed', err)
    } finally {
      setSubmitting(false)
    }
  }

  function handleSingleSelect(label: string) {
    setSelectedOptions(new Set([label]))
    handleSubmit(label)
  }

  function toggleMultiOption(label: string) {
    setSelectedOptions((prev) => {
      const next = new Set(prev)
      if (next.has(label)) {
        next.delete(label)
      } else {
        next.add(label)
      }
      return next
    })
  }

  function handleMultiSubmit() {
    const joined = Array.from(selectedOptions).join(', ')
    handleSubmit(joined)
  }

  function handleFreeformSubmit() {
    handleSubmit(freeformText)
  }

  const claimedByOtherMessage = promptState === 'claimed_by_other'
    ? <p className="text-xs text-muted-foreground italic">Another tab is responding to this prompt</p>
    : null

  return (
    <div className="border-t border-border bg-card/30 p-4 space-y-3 animate-in fade-in duration-200">
      {/* Mode A & B: AskUserQuestion */}
      {question && (
        <>
          <div className="flex items-start gap-2">
            <MessageCircleQuestion className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <p className="text-sm font-medium text-foreground">{question.question}</p>
          </div>

          {claimedByOtherMessage}

          <div className="space-y-2">
            {question.options.map((option) => {
              const isSelected = selectedOptions.has(option.label)
              return (
                <button
                  key={option.label}
                  disabled={isDisabled}
                  onClick={() =>
                    question.multiSelect
                      ? toggleMultiOption(option.label)
                      : handleSingleSelect(option.label)
                  }
                  className={[
                    'w-full text-left rounded-lg p-3 border transition-colors',
                    'bg-card hover:bg-primary/10 hover:border-primary/50',
                    isSelected
                      ? 'border-primary bg-primary/10'
                      : 'border-border',
                    isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-foreground text-sm">{option.label}</p>
                      {option.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{option.description}</p>
                      )}
                    </div>
                    {question.multiSelect && isSelected && (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Submit button for multi-select only */}
          {question.multiSelect && (
            <button
              disabled={isDisabled || selectedOptions.size === 0}
              onClick={handleMultiSubmit}
              className={[
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                'bg-primary text-primary-foreground hover:bg-primary/80',
                (isDisabled || selectedOptions.size === 0) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
            >
              <Send className="h-3.5 w-3.5" />
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          )}
        </>
      )}

      {/* Mode C: Freeform wait */}
      {isFreeform && (
        <>
          <div className="flex items-start gap-2">
            <MessageCircleQuestion className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <p className="text-sm font-medium text-foreground">This instance is waiting for your input.</p>
          </div>

          {claimedByOtherMessage}

          <textarea
            disabled={isDisabled}
            value={freeformText}
            onChange={(e) => setFreeformText(e.target.value)}
            placeholder="Type your response..."
            rows={3}
            className={[
              'w-full bg-card border border-border rounded-lg p-3 text-foreground text-sm',
              'placeholder:text-muted-foreground resize-none focus:outline-none focus:border-primary/50',
              isDisabled ? 'opacity-50 cursor-not-allowed' : '',
            ].join(' ')}
          />

          <button
            disabled={isDisabled || !freeformText.trim()}
            onClick={handleFreeformSubmit}
            className={[
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              'bg-primary text-primary-foreground hover:bg-primary/80',
              (isDisabled || !freeformText.trim()) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
            ].join(' ')}
          >
            <Send className="h-3.5 w-3.5" />
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        </>
      )}
    </div>
  )
}
