export type WsIncomingMessage =
  | { type: 'stream_event'; instance_id: string; data: Record<string, unknown> }
  | { type: 'node_status_update'; node_id: string; status: 'connected' | 'stale' | 'disconnected' }
  | { type: 'instance_status'; instance_id: string; status: 'pending' | 'running' | 'finished' | 'errored' }
  | { type: 'new_node_alert'; node_id: string }

export type WsOutgoingMessage =
  | { type: 'subscribe'; instance_id: string }
  | { type: 'unsubscribe'; instance_id: string }
