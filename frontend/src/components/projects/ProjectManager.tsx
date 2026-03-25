import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { FolderOpen } from '@/lib/icons'
import { ConnectProjectDialog } from './ConnectProjectDialog'
import { CloneProjectDialog } from './CloneProjectDialog'
import { BootstrapProjectDialog } from './BootstrapProjectDialog'
import type { ProjectResponse, ProjectActionResponse } from '@/types/api'

interface ProjectManagerProps {
  nodeId: string
  onInstanceCreated: (instanceId: string) => void
}

export function ProjectManager({ nodeId, onInstanceCreated }: ProjectManagerProps) {
  const queryClient = useQueryClient()

  const { data: projects = [] } = useQuery({
    queryKey: ['projects', nodeId],
    queryFn: () => api<ProjectResponse[]>(`/api/nodes/${nodeId}/projects`),
  })

  const handleSuccess = (result: ProjectActionResponse) => {
    queryClient.invalidateQueries({ queryKey: ['projects', nodeId] })
    if (result.instance_id != null) {
      onInstanceCreated(result.instance_id)
    }
  }

  return (
    <div className="space-y-3 p-4 bg-muted/50 rounded-lg border border-border">
      <div className="text-sm font-medium text-muted-foreground uppercase tracking-widest inline-flex items-center gap-1.5">
        <FolderOpen size={20} className="text-primary" />
        Projects
      </div>

      <div className="space-y-1">
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No projects registered yet.</p>
        ) : (
          projects.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm py-1">
              <span className="font-mono text-foreground">{p.name}</span>
              <span className="text-muted-foreground text-xs truncate ml-2">{p.work_dir}</span>
            </div>
          ))
        )}
      </div>

      <div className="flex gap-2">
        <ConnectProjectDialog nodeId={nodeId} onSuccess={handleSuccess} />
        <CloneProjectDialog nodeId={nodeId} onSuccess={handleSuccess} />
        <BootstrapProjectDialog nodeId={nodeId} onSuccess={handleSuccess} />
      </div>
    </div>
  )
}
