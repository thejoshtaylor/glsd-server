import { useWsStore } from '@/stores/wsStore'
import { Button } from '@/components/ui/button'
import { Play, Square } from '@/lib/icons'

interface AutoModeToggleProps {
  nodeId: string
}

export function AutoModeToggle({ nodeId }: AutoModeToggleProps) {
  const autoModeNodeIds = useWsStore((s) => s.autoModeNodeIds)
  const toggleAutoMode = useWsStore((s) => s.toggleAutoMode)
  const enabled = autoModeNodeIds.includes(nodeId)

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant={enabled ? 'default' : 'outline'}
        onClick={() => toggleAutoMode(nodeId)}
        className="h-7 px-3 text-xs"
      >
        {enabled ? (
          <>
            <Square size={12} className="mr-1" />
            Stop Auto
          </>
        ) : (
          <>
            <Play size={12} className="mr-1" />
            Auto Mode
          </>
        )}
      </Button>
    </div>
  )
}
