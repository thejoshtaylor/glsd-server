import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog'
import { FolderPlus } from '@/lib/icons'
import type { ProjectActionResponse } from '@/types/api'

interface BootstrapProjectDialogProps {
  nodeId: string
  onSuccess: (result: ProjectActionResponse) => void
}

export function BootstrapProjectDialog({ nodeId, onSuccess }: BootstrapProjectDialogProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [workDir, setWorkDir] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      api<ProjectActionResponse>('/api/projects/bootstrap', {
        method: 'POST',
        body: JSON.stringify({ node_id: nodeId, name, work_dir: workDir }),
      }),
    onSuccess: (result) => {
      onSuccess(result)
      setOpen(false)
      setName('')
      setWorkDir('')
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={
        <Button variant="outline" size="sm">
          <FolderPlus size={14} className="mr-1" /> New
        </Button>
      } />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bootstrap New Project</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-semibold">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-project"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-semibold">Working Directory</label>
            <Input
              value={workDir}
              onChange={(e) => setWorkDir(e.target.value)}
              placeholder="/home/user/my-project"
              required
            />
          </div>
          {mutation.isError && (
            <p className="text-sm text-red-400">{mutation.error.message}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!name || !workDir || mutation.isPending}
          >
            {mutation.isPending ? 'Bootstrapping...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
