import { useEffect } from 'react'
import { Mic, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useVoiceRecorder, type RecorderState } from '@/hooks/useVoiceRecorder'
import { toast } from 'sonner'

interface VoiceButtonProps {
  onTranscript: (text: string) => void
  onStateChange?: (state: RecorderState) => void
  disabled?: boolean
}

export function VoiceButton({ onTranscript, onStateChange, disabled }: VoiceButtonProps) {
  const handleError = (message: string) => {
    toast.error(message, {
      description: 'Try again.',
      duration: 5000,
    })
  }

  const handleTranscript = (text: string) => {
    onTranscript(text)
  }

  const { state, elapsed, start, stop } = useVoiceRecorder(handleTranscript, handleError)

  const handleClick = () => {
    if (state === 'recording') {
      stop()
    } else if (state === 'idle') {
      start()
    }
    // Do nothing if state === 'processing'
  }

  useEffect(() => {
    onStateChange?.(state)
  }, [state, onStateChange])

  return (
    <div className="flex items-center gap-2">
      {state === 'recording' && (
        <div className="flex items-center gap-1.5 text-sm text-red-400">
          <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span>{elapsed}s</span>
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={handleClick}
        disabled={disabled || state === 'processing'}
        className={state === 'recording' ? 'border-red-500 text-red-400' : ''}
        title={state === 'recording' ? 'Stop recording' : state === 'processing' ? 'Transcribing...' : 'Record voice prompt'}
      >
        {state === 'recording' ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </Button>
    </div>
  )
}
