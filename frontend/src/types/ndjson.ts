export type AssistantTextEvent = {
  type: 'assistant'
  message: { content: Array<{ type: 'text'; text: string }> }
}

export type ToolUseEvent = {
  type: 'tool_use'
  name: string
  input: Record<string, unknown>
}

export type ToolResultEvent = {
  type: 'tool_result'
  tool_use_id: string
  content: Array<{ type: 'text'; text: string }>
}

export type SystemEvent = {
  type: 'system'
  subtype: string
  [key: string]: unknown
}

export type ResultEvent = {
  type: 'result'
  subtype: 'success' | 'error'
  result?: string
  error?: string
  cost_usd?: number
}

export type NdjsonEvent =
  | AssistantTextEvent
  | ToolUseEvent
  | ToolResultEvent
  | SystemEvent
  | ResultEvent
