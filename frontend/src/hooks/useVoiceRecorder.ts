import { useState, useRef, useCallback, useEffect } from 'react'

export type RecorderState = 'idle' | 'recording' | 'processing'

async function sendForTranscription(
  blob: Blob,
  onTranscript: (text: string) => void,
  onError: (error: string) => void,
): Promise<void> {
  try {
    const formData = new FormData()
    formData.append('file', blob, 'audio.webm')
    // Use raw fetch — NOT the api() helper — to avoid Content-Type header injection
    const { getAccessToken } = await import('@/lib/api')
    const token = getAccessToken()
    const res = await fetch('/api/transcribe', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
      // DO NOT set Content-Type — browser must set multipart boundary
    })
    if (!res.ok) {
      const text = await res.text()
      onError(text || 'Transcription failed')
      return
    }
    const data = await res.json()
    onTranscript(data.text)
  } catch {
    onError('Transcription failed. Try again.')
  }
}

export function useVoiceRecorder(
  onTranscript: (text: string) => void,
  onError: (error: string) => void,
) {
  const [state, setState] = useState<RecorderState>('idle')
  const [elapsed, setElapsed] = useState(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const MAX_DURATION_S = 60

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    mediaRecorderRef.current = null
  }, [])

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'

      const recorder = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null
        setState('processing')
        const blob = new Blob(chunksRef.current, { type: mimeType })
        await sendForTranscription(blob, onTranscript, onError)
        setState('idle')
        setElapsed(0)
      }

      recorder.start(250)
      mediaRecorderRef.current = recorder
      setState('recording')
      setElapsed(0)
      timerRef.current = setInterval(() => {
        setElapsed(prev => prev + 1)
      }, 1000)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        onError('Microphone permission denied')
      } else {
        onError('Failed to start recording')
      }
    }
  }, [onTranscript, onError])

  // Auto-stop at MAX_DURATION_S
  useEffect(() => {
    if (elapsed >= MAX_DURATION_S) {
      stop()
    }
  }, [elapsed, stop])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop()
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [stop])

  return { state, elapsed, start, stop }
}
