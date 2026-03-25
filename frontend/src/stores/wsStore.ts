import { create } from 'zustand'
import { toast } from 'sonner'
import { queryClient } from '../lib/queryClient'
import type { NdjsonEvent } from '../types/ndjson'
import type { WsIncomingMessage } from '../types/protocol'

interface SequenceState {
  sequence_id: string
  node_id: string
  steps: Array<{ command_id: string; params: Record<string, string> }>
  current_step: number
  total_steps: number
  status: 'running' | 'paused' | 'done' | 'error'
  auto_advance: boolean
  error_reason?: string
}

interface WsStore {
  socket: WebSocket | null
  connected: boolean
  streamBuffers: Record<string, NdjsonEvent[]>
  instanceStatuses: Record<string, string>
  newNodeAlerts: string[]
  sequenceStates: Record<string, SequenceState>
  autoModeNodeIds: string[]
  setSocket: (ws: WebSocket | null) => void
  setConnected: (connected: boolean) => void
  handleMessage: (msg: WsIncomingMessage) => void
  appendStreamEvent: (instanceId: string, event: NdjsonEvent) => void
  clearStreamBuffer: (instanceId: string) => void
  setInstanceStatus: (instanceId: string, status: string) => void
  dismissAlert: (nodeId: string) => void
  toggleAutoMode: (nodeId: string) => void
  clearSequenceState: (sequenceId: string) => void
}

export const useWsStore = create<WsStore>((set, get) => ({
  socket: null,
  connected: false,
  streamBuffers: {},
  instanceStatuses: {},
  newNodeAlerts: [],
  sequenceStates: {},
  autoModeNodeIds: [],

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

  toggleAutoMode: (nodeId) => {
    set((s) => ({
      autoModeNodeIds: s.autoModeNodeIds.includes(nodeId)
        ? s.autoModeNodeIds.filter((id) => id !== nodeId)
        : [...s.autoModeNodeIds, nodeId],
    }))
  },

  clearSequenceState: (sequenceId) => {
    set((s) => {
      const { [sequenceId]: _, ...rest } = s.sequenceStates
      return { sequenceStates: rest }
    })
  },

  handleMessage: (msg) => {
    switch (msg.type) {
      case 'node_status_update':
        queryClient.invalidateQueries({ queryKey: ['nodes'] })
        break
      case 'stream_event':
        get().appendStreamEvent(msg.instance_id, msg.data as NdjsonEvent)
        break
      case 'instance_status':
        get().setInstanceStatus(msg.instance_id, msg.status)
        queryClient.invalidateQueries({ queryKey: ['instances'] })
        queryClient.invalidateQueries({ queryKey: ['instance', msg.instance_id] })
        queryClient.setQueryData(
          ['instance', msg.instance_id],
          (old: unknown) => old ? { ...(old as object), status: msg.status } : old
        )
        break
      case 'new_node_alert':
        queryClient.invalidateQueries({ queryKey: ['nodes'] })
        set((s) => ({
          newNodeAlerts: [...s.newNodeAlerts, msg.node_id],
        }))
        break
      case 'prompt_claimed':
        // handled by other feature slices
        break
      case 'prompt_answered':
        // handled by other feature slices
        break
      case 'sequence_started': {
        // ACK -- sequence_id now known. Store is populated on first step_started.
        break
      }
      case 'sequence_step_started': {
        set((s) => ({
          sequenceStates: {
            ...s.sequenceStates,
            [msg.sequence_id]: {
              ...(s.sequenceStates[msg.sequence_id] ?? {
                sequence_id: msg.sequence_id,
                node_id: msg.node_id,
                steps: [],
              }),
              sequence_id: msg.sequence_id,
              node_id: msg.node_id,
              current_step: msg.step_index,
              total_steps: msg.total_steps,
              status: 'running' as const,
              auto_advance: msg.auto_advance,
            },
          },
        }))
        break
      }
      case 'sequence_step_completed': {
        set((s) => {
          const existing = s.sequenceStates[msg.sequence_id]
          if (!existing) return s
          return {
            sequenceStates: {
              ...s.sequenceStates,
              [msg.sequence_id]: {
                ...existing,
                current_step: msg.step_index,
                status: msg.auto_advance ? 'running' : 'paused',
              },
            },
          }
        })
        break
      }
      case 'sequence_done': {
        set((s) => {
          const existing = s.sequenceStates[msg.sequence_id]
          if (!existing) return s
          return {
            sequenceStates: {
              ...s.sequenceStates,
              [msg.sequence_id]: { ...existing, status: 'done' as const },
            },
          }
        })
        toast.success('Sequence completed', { description: `All steps finished on node ${msg.node_id.slice(0, 8)}` })
        break
      }
      case 'sequence_error': {
        set((s) => {
          const existing = s.sequenceStates[msg.sequence_id]
          if (!existing) return s
          return {
            sequenceStates: {
              ...s.sequenceStates,
              [msg.sequence_id]: { ...existing, status: 'error' as const, error_reason: msg.reason },
            },
          }
        })
        toast.error('Sequence error', { description: msg.reason })
        break
      }
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
