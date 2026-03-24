import { useState } from 'react'
import type { ToolUseEvent } from '@/types/ndjson'
import { ChevronRight, ChevronDown, Wrench } from 'lucide-react'

export function ToolUse({ event }: { event: ToolUseEvent }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border-l-2 border-amber-500 pl-3 py-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-sm text-amber-400 hover:text-amber-300"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Wrench className="h-3 w-3" />
        <span className="font-medium">{event.name}</span>
      </button>
      {expanded && (
        <pre className="mt-1 text-xs text-muted-foreground font-mono overflow-x-auto">
          {JSON.stringify(event.input, null, 2)}
        </pre>
      )}
    </div>
  )
}
