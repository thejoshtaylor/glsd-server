export type GsdClassification = 'AskUserQuestion' | 'freeform_wait' | 'completed' | null

export type WsIncomingMessage =
  | { type: 'stream_event'; instance_id: string; data: Record<string, unknown>; gsd: GsdClassification }
  | { type: 'node_status_update'; node_id: string; status: 'connected' | 'stale' | 'disconnected' }
  | { type: 'instance_status'; instance_id: string; status: 'pending' | 'running' | 'finished' | 'errored' }
  | { type: 'new_node_alert'; node_id: string }
  | { type: 'prompt_claimed'; instance_id: string; is_mine: boolean }
  | { type: 'prompt_answered'; instance_id: string }
  | { type: 'sequence_started'; sequence_id: string }
  | { type: 'sequence_step_started'; sequence_id: string; node_id: string; step_index: number; total_steps: number; command_id: string; auto_advance: boolean }
  | { type: 'sequence_step_completed'; sequence_id: string; node_id: string; step_index: number; total_steps: number; command_id: string; auto_advance: boolean }
  | { type: 'sequence_done'; sequence_id: string; node_id: string }
  | { type: 'sequence_error'; sequence_id: string; node_id: string; reason: string }

export type WsOutgoingMessage =
  | { type: 'subscribe'; instance_id: string }
  | { type: 'unsubscribe'; instance_id: string }
  | { type: 'claim_prompt'; instance_id: string }
  | { type: 'submit_answer'; instance_id: string; prompt: string; session_id: string }
  | { type: 'start_sequence'; node_id: string; project: string; work_dir: string; steps: Array<{ command_id: string; params: Record<string, string> }>; auto_advance: boolean }
  | { type: 'cancel_sequence'; sequence_id: string }
  | { type: 'advance_sequence'; sequence_id: string }
