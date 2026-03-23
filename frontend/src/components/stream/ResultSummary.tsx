import type { ResultEvent } from '@/types/ndjson'

export function ResultSummary({ event }: { event: ResultEvent }) {
  const isError = event.subtype === 'error'
  return (
    <div className={`border-l-2 ${isError ? 'border-red-500' : 'border-green-500'} pl-3 py-2 mt-2`}>
      <div className={`text-sm font-medium ${isError ? 'text-red-400' : 'text-green-400'}`}>
        {isError ? 'Error' : 'Completed'}
      </div>
      {event.result && <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono mt-1">{event.result}</pre>}
      {event.error && <pre className="text-sm text-red-300 whitespace-pre-wrap font-mono mt-1">{event.error}</pre>}
      {event.cost_usd != null && (
        <div className="text-xs text-gray-500 mt-1">Cost: ${event.cost_usd.toFixed(4)}</div>
      )}
    </div>
  )
}
