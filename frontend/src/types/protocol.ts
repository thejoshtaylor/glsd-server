export type GsdClassification = 'AskUserQuestion' | 'freeform_wait' | 'completed' | null

export type WsIncomingMessage =
  | { type: 'stream_event'; instance_id: string; data: Record<string, unknown>; gsd: GsdClassification }
  | { type: 'node_status_update'; node_id: string; status: 'connected' | 'stale' | 'disconnected' }
  | { type: 'instance_status'; instance_id: string; status: 'pending' | 'running' | 'finished' | 'errored' }
  | { type: 'new_node_alert'; node_id: string }
  | { type: 'prompt_claimed'; instance_id: string; is_mine: boolean }
  | { type: 'prompt_answered'; instance_id: string }

export type WsOutgoingMessage =
  | { type: 'subscribe'; instance_id: string }
  | { type: 'unsubscribe'; instance_id: string }
  | { type: 'claim_prompt'; instance_id: string }
  | { type: 'submit_answer'; instance_id: string; prompt: string; session_id: string }
