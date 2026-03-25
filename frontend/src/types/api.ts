export interface NodeResponse {
  node_id: string
  platform: string
  version: string
  projects: string[] | null
  status: 'connected' | 'stale' | 'disconnected'
  first_seen: string
  connected_at: string | null
  last_heartbeat: string | null
  last_seen: string | null
}

export interface InstanceResponse {
  instance_id: string
  node_id: string
  project: string
  prompt: string | null
  session_id: string | null
  status: 'pending' | 'running' | 'finished' | 'errored'
  exit_code: number | null
  error: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

export interface StreamEventResponse {
  id: number
  instance_id: string
  sequence_num: number
  data: Record<string, unknown>
  created_at: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface AuditLogResponse {
  id: number
  timestamp: string
  node_id: string | null
  instance_id: string | null
  user_id: string | null
  event_type: string
  details: Record<string, unknown> | null
}

export interface ProjectResponse {
  id: number
  node_id: string
  name: string
  work_dir: string
  created_at: string
}

export interface ProjectActionResponse {
  instance_id: string | null
  project: ProjectResponse
}
