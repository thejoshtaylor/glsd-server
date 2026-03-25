import { formatDistanceToNow } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { AuditLogResponse } from '@/types/api'

interface AuditTableProps {
  entries: AuditLogResponse[]
  isLoading: boolean
  isError: boolean
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  execute: 'bg-[oklch(0.75_0.18_195/15%)] text-[oklch(0.75_0.18_195)] border-[oklch(0.75_0.18_195/30%)]',
  kill: 'bg-[oklch(0.70_0.25_330/15%)] text-[oklch(0.70_0.25_330)] border-[oklch(0.70_0.25_330/30%)]',
  instance_finished: 'bg-muted/30 text-muted-foreground border-muted-foreground/20',
  instance_error: 'bg-[oklch(0.65_0.22_25/15%)] text-[oklch(0.65_0.22_25)] border-[oklch(0.65_0.22_25/30%)]',
}

const SKELETON_ROWS = Array.from({ length: 8 }, (_, i) => i)

export function AuditTable({ entries, isLoading, isError }: AuditTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-40">Timestamp</TableHead>
          <TableHead className="w-36">Event Type</TableHead>
          <TableHead className="w-40">Node</TableHead>
          <TableHead className="w-72">Instance ID</TableHead>
          <TableHead>Details</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody aria-busy={isLoading}>
        {isLoading && (
          <>
            {SKELETON_ROWS.map((i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                <TableCell><Skeleton className="h-4 w-full" /></TableCell>
              </TableRow>
            ))}
          </>
        )}
        {!isLoading && isError && (
          <TableRow>
            <TableCell colSpan={5} className="text-center">
              <span className="text-sm text-red-400">
                Failed to load audit log. Check your connection and try again.
              </span>
            </TableCell>
          </TableRow>
        )}
        {!isLoading && !isError && entries.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-center">
              <span className="text-sm text-muted-foreground">No audit entries found.</span>
            </TableCell>
          </TableRow>
        )}
        {!isLoading && !isError && entries.map((entry) => (
          <TableRow key={entry.id} className="hover:bg-muted">
            <TableCell>
              <span title={entry.timestamp}>
                {formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true })}
              </span>
            </TableCell>
            <TableCell>
              <Badge
                variant="outline"
                className={EVENT_TYPE_COLORS[entry.event_type] ?? ''}
              >
                {entry.event_type}
              </Badge>
            </TableCell>
            <TableCell>{entry.node_id ?? '—'}</TableCell>
            <TableCell className="truncate" title={entry.instance_id ?? ''}>
              {entry.instance_id ? `${entry.instance_id.slice(0, 8)}...` : '—'}
            </TableCell>
            <TableCell>
              {entry.details != null
                ? JSON.stringify(entry.details)
                : <span className="text-sm text-muted-foreground">—</span>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
