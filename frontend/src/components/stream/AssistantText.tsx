import type { AssistantTextEvent } from '@/types/ndjson'

export function AssistantText({ event }: { event: AssistantTextEvent }) {
  const textBlocks = event.message.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text)

  return (
    <div className="border-l-2 border-blue-500 pl-3 py-1">
      {textBlocks.map((text, i) => (
        <pre key={i} className="text-sm text-gray-200 whitespace-pre-wrap font-mono">{text}</pre>
      ))}
    </div>
  )
}
