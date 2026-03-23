import type { ToolResultEvent } from '@/types/ndjson'

export function ToolResult({ event }: { event: ToolResultEvent }) {
  const textBlocks = event.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text)

  return (
    <div className="border-l-2 border-purple-500 pl-3 py-1">
      <div className="text-xs text-purple-400 mb-1">Tool result</div>
      {textBlocks.map((text, i) => (
        <pre key={i} className="text-xs text-gray-300 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">{text}</pre>
      ))}
    </div>
  )
}
