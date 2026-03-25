import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Square } from '@/lib/icons'

interface KillButtonProps {
  nodeId: string
  instanceId: string
  disabled?: boolean
}

export function KillButton({ nodeId, instanceId, disabled }: KillButtonProps) {
  const queryClient = useQueryClient()

  const killMutation = useMutation({
    mutationFn: () =>
      api<{ detail: string }>(`/api/instances/${instanceId}/kill`, {
        method: 'POST',
        body: JSON.stringify({ node_id: nodeId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances'] })
    },
  })

  return (
    <Button
      variant="destructive"
      size="sm"
      onClick={() => killMutation.mutate()}
      disabled={disabled || killMutation.isPending}
    >
      <Square className="h-3 w-3 mr-1" />
      {killMutation.isPending ? 'Killing...' : 'Kill'}
    </Button>
  )
}
