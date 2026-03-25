import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/lib/api'
import { AuditFilters } from '@/components/audit/AuditFilters'
import { AuditTable } from '@/components/audit/AuditTable'
import { Button } from '@/components/ui/button'
import { Shield } from '@/lib/icons'
import type { NodeResponse, AuditLogResponse } from '@/types/api'

export const Route = createFileRoute('/dashboard/audit')({
  component: AuditPage,
})

const PAGE_SIZE = 25

function AuditPage() {
  const [selectedNodeId, setSelectedNodeId] = useState<string>('')
  const [selectedType, setSelectedType] = useState<string>('all')
  const [offset, setOffset] = useState(0)

  // Fetch nodes for the filter dropdown
  const {
    data: nodes,
    isLoading: isLoadingNodes,
    isError: nodesError,
  } = useQuery({
    queryKey: ['nodes'],
    queryFn: () => api<NodeResponse[]>('/api/nodes'),
  })

  // Auto-select first node when nodes load
  const effectiveNodeId = selectedNodeId || (nodes?.[0]?.node_id ?? '')

  // Fetch audit entries
  const {
    data: entries,
    isLoading: isLoadingAudit,
    isError: auditError,
  } = useQuery({
    queryKey: ['audit', effectiveNodeId, selectedType, offset],
    queryFn: () => {
      const params = new URLSearchParams({
        node_id: effectiveNodeId,
        limit: String(PAGE_SIZE),
        offset: String(offset),
      })
      if (selectedType !== 'all') params.set('type', selectedType)
      return api<AuditLogResponse[]>(`/api/audit?${params}`)
    },
    enabled: !!effectiveNodeId,
  })

  const handleNodeChange = (nodeId: string | null) => {
    setSelectedNodeId(nodeId ?? '')
    setOffset(0)
  }

  const handleTypeChange = (type: string | null) => {
    setSelectedType(type ?? 'all')
    setOffset(0)
  }

  const hasNoNodes = !isLoadingNodes && (!nodes || nodes.length === 0)

  return (
    <div className="p-6 space-y-4 animate-in fade-in duration-150 fill-mode-both">
      <h2 className="text-xl font-semibold font-heading text-foreground inline-flex items-center gap-2">
        <Shield size={20} className="text-primary" />
        Audit Log
      </h2>

      <AuditFilters
        nodes={nodes ?? []}
        selectedNodeId={effectiveNodeId}
        selectedType={selectedType}
        onNodeChange={handleNodeChange}
        onTypeChange={handleTypeChange}
        isLoadingNodes={isLoadingNodes}
        nodesError={!!nodesError}
      />

      {hasNoNodes ? (
        <p className="text-sm text-muted-foreground">No nodes found. Connect a node to see audit entries.</p>
      ) : (
        <>
          <AuditTable
            entries={entries ?? []}
            isLoading={isLoadingAudit}
            isError={!!auditError}
          />

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0}
              aria-disabled={offset === 0}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              {entries && entries.length > 0
                ? `Showing ${offset + 1}\u2013${offset + entries.length} results`
                : ''}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={!entries || entries.length < PAGE_SIZE}
              aria-disabled={!entries || entries.length < PAGE_SIZE}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
