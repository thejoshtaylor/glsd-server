import { create } from 'zustand'
import { queryClient } from '../lib/queryClient'
import type { NdjsonEvent } from '../types/ndjson'
import type { WsIncomingMessage } from '../types/protocol'

interface WsStore {
  socket: WebSocket | null
  connected: boolean
  streamBuffers: Record<string, NdjsonEvent[]>
  setSocket: (ws: WebSocket | null) => void
  setConnected: (connected: boolean) => void
  handleMessage: (msg: WsIncomingMessage) => void
  appendStreamEvent: (instanceId: string, event: NdjsonEvent) => void
  clearStreamBuffer: (instanceId: string) => void
}

export const useWsStore = create<WsStore>((set, get) => ({
  socket: null,
  connected: false,
  streamBuffers: {},

  setSocket: (ws) => set({ socket: ws }),
  setConnected: (connected) => set({ connected }),

  handleMessage: (msg) => {
    switch (msg.type) {
      case 'node_status_update':
        queryClient.invalidateQueries({ queryKey: ['nodes'] })
        break
      case 'stream_event':
        get().appendStreamEvent(msg.instance_id, msg.data as NdjsonEvent)
        break
      case 'instance_status':
        queryClient.invalidateQueries({ queryKey: ['instances'] })
        queryClient.invalidateQueries({ queryKey: ['instance', msg.instance_id] })
        break
      case 'new_node_alert':
        queryClient.invalidateQueries({ queryKey: ['nodes'] })
        // Store the alert for UI notification (Plan 05 will consume)
        break
    }
  },

  appendStreamEvent: (instanceId, event) => {
    set((s) => ({
      streamBuffers: {
        ...s.streamBuffers,
        [instanceId]: [...(s.streamBuffers[instanceId] ?? []), event],
      },
    }))
  },

  clearStreamBuffer: (instanceId) => {
    set((s) => {
      const { [instanceId]: _, ...rest } = s.streamBuffers
      return { streamBuffers: rest }
    })
  },
}))
