import { create } from 'zustand'
import { toast } from 'sonner'
import { queryClient } from '../lib/queryClient'
import type { NdjsonEvent } from '../types/ndjson'
import type { WsIncomingMessage } from '../types/protocol'

interface WsStore {
  socket: WebSocket | null
  connected: boolean
  streamBuffers: Record<string, NdjsonEvent[]>
  instanceStatuses: Record<string, string>
  newNodeAlerts: string[]
  promptStates: Record<string, 'pending' | 'claimed_by_me' | 'claimed_by_other' | 'answered'>
  setSocket: (ws: WebSocket | null) => void
  setConnected: (connected: boolean) => void
  handleMessage: (msg: WsIncomingMessage) => void
  appendStreamEvent: (instanceId: string, event: NdjsonEvent) => void
  clearStreamBuffer: (instanceId: string) => void
  setInstanceStatus: (instanceId: string, status: string) => void
  dismissAlert: (nodeId: string) => void
  setPromptState: (instanceId: string, state: WsStore['promptStates'][string]) => void
  clearPromptState: (instanceId: string) => void
}

export const useWsStore = create<WsStore>((set, get) => ({
  socket: null,
  connected: false,
  streamBuffers: {},
  instanceStatuses: {},
  newNodeAlerts: [],
  promptStates: {},

  setSocket: (ws) => set({ socket: ws }),
  setConnected: (connected) => set({ connected }),

  setInstanceStatus: (instanceId, status) => {
    set((s) => ({
      instanceStatuses: { ...s.instanceStatuses, [instanceId]: status },
    }))
  },

  dismissAlert: (nodeId) => {
    set((s) => ({
      newNodeAlerts: s.newNodeAlerts.filter((id) => id !== nodeId),
    }))
  },

  setPromptState: (instanceId, state) => {
    set((s) => ({
      promptStates: { ...s.promptStates, [instanceId]: state },
    }))
  },

  clearPromptState: (instanceId) => {
    set((s) => {
      const { [instanceId]: _, ...rest } = s.promptStates
      return { promptStates: rest }
    })
  },

  handleMessage: (msg) => {
    switch (msg.type) {
      case 'node_status_update':
        queryClient.invalidateQueries({ queryKey: ['nodes'] })
        break
      case 'stream_event':
        get().appendStreamEvent(msg.instance_id, msg.data as NdjsonEvent)
        // When AskUserQuestion or freeform_wait arrives via live stream (gsd !== null),
        // set prompt to pending so InteractiveResponseUI can render
        if (msg.gsd === 'AskUserQuestion' || msg.gsd === 'freeform_wait') {
          const currentState = get().promptStates[msg.instance_id]
          if (!currentState || currentState === 'answered') {
            get().setPromptState(msg.instance_id, 'pending')
          }
        }
        // Sonner toast for input-needed events — live events only (gsd !== null means not a replay)
        if (msg.gsd === 'AskUserQuestion') {
          toast.info('Input needed', { description: 'A node is waiting for your answer' })
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
            new Notification('Input needed', { body: 'A GSD node is waiting for your answer', icon: '/vite.svg' })
          }
        } else if (msg.gsd === 'freeform_wait') {
          toast.info('Input needed', { description: 'A node is waiting for text input' })
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
            new Notification('Input needed', { body: 'A GSD node is waiting for text input', icon: '/vite.svg' })
          }
        }
        break
      case 'instance_status':
        get().setInstanceStatus(msg.instance_id, msg.status)
        queryClient.invalidateQueries({ queryKey: ['instances'] })
        queryClient.invalidateQueries({ queryKey: ['instance', msg.instance_id] })
        queryClient.setQueryData(
          ['instance', msg.instance_id],
          (old: unknown) => old ? { ...(old as object), status: msg.status } : old
        )
        // Clear prompt state on instance termination — never show prompt on dead instance
        if (msg.status === 'finished' || msg.status === 'errored') {
          get().clearPromptState(msg.instance_id)
        }
        // Sonner toast for completion/error events (NOTF-03)
        if (msg.status === 'finished') {
          toast.success('Instance completed', { description: msg.instance_id.slice(0, 8) })
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
            new Notification('Instance completed', { body: `Instance ${msg.instance_id.slice(0, 8)} finished`, icon: '/vite.svg' })
          }
        } else if (msg.status === 'errored') {
          toast.error('Instance errored', { description: msg.instance_id.slice(0, 8) })
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
            new Notification('Instance errored', { body: `Instance ${msg.instance_id.slice(0, 8)} errored`, icon: '/vite.svg' })
          }
        }
        break
      case 'new_node_alert':
        queryClient.invalidateQueries({ queryKey: ['nodes'] })
        set((s) => ({
          newNodeAlerts: [...s.newNodeAlerts, msg.node_id],
        }))
        break
      case 'prompt_claimed':
        get().setPromptState(msg.instance_id, msg.is_mine ? 'claimed_by_me' : 'claimed_by_other')
        break
      case 'prompt_answered':
        get().setPromptState(msg.instance_id, 'answered')
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
