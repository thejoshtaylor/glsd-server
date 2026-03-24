import { useEffect, useRef } from 'react'
import { useWsStore } from '../stores/wsStore'
import { getAccessToken } from '../lib/api'
import type { WsIncomingMessage } from '../types/protocol'

const RECONNECT_DELAY_MS = 3000
const MAX_RECONNECT_DELAY_MS = 30000

export function useWebSocket() {
  const { setSocket, setConnected, handleMessage } = useWsStore()
  const reconnectAttempt = useRef(0)
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout>>(undefined)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    let unmounted = false

    async function connect() {
      const accessToken = getAccessToken()
      if (!accessToken) return

      // Obtain a fresh WS ticket
      try {
        const res = await fetch('/api/auth/ws-ticket', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (!res.ok) return
        const { ticket } = await res.json()

        if (unmounted) return

        // Prevent duplicate connections (React StrictMode)
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws/frontend?ticket=${ticket}`)
        wsRef.current = ws

        ws.onopen = () => {
          if (unmounted) { ws.close(); return }
          reconnectAttempt.current = 0
          setSocket(ws)
          setConnected(true)
        }

        ws.onmessage = (event) => {
          try {
            const msg: WsIncomingMessage = JSON.parse(event.data as string)
            handleMessage(msg)
          } catch {
            // Ignore malformed messages
          }
        }

        ws.onclose = () => {
          if (unmounted) return
          setSocket(null)
          setConnected(false)
          wsRef.current = null
          // Exponential backoff reconnect
          const delay = Math.min(
            RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempt.current),
            MAX_RECONNECT_DELAY_MS
          )
          reconnectAttempt.current++
          reconnectTimeout.current = setTimeout(connect, delay)
        }

        ws.onerror = () => {
          // onclose will fire after onerror
        }
      } catch {
        // Network error fetching ticket — retry
        if (!unmounted) {
          const delay = Math.min(
            RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempt.current),
            MAX_RECONNECT_DELAY_MS
          )
          reconnectAttempt.current++
          reconnectTimeout.current = setTimeout(connect, delay)
        }
      }
    }

    connect()

    return () => {
      unmounted = true
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current)
      if (wsRef.current) {
        wsRef.current.onclose = null // Prevent reconnect on intentional close
        wsRef.current.close()
        wsRef.current = null
      }
      setSocket(null)
      setConnected(false)
    }
  }, [setSocket, setConnected, handleMessage])
}
