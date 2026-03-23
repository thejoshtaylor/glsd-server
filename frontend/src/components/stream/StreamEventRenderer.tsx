import type { NdjsonEvent } from '@/types/ndjson'
import { AssistantText } from './AssistantText'
import { ToolUse } from './ToolUse'
import { ToolResult } from './ToolResult'
import { SystemEvent } from './SystemEvent'
import { ResultSummary } from './ResultSummary'

export function StreamEventRenderer({ event }: { event: NdjsonEvent }) {
  switch (event.type) {
    case 'assistant':
      return <AssistantText event={event} />
    case 'tool_use':
      return <ToolUse event={event} />
    case 'tool_result':
      return <ToolResult event={event} />
    case 'system':
      return <SystemEvent event={event} />
    case 'result':
      return <ResultSummary event={event} />
    default:
      return <div className="text-xs text-gray-600 pl-3">[unknown event]</div>
  }
}
