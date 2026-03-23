import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard/')({
  component: () => <div className="p-6 text-gray-300">Dashboard — loading...</div>,
})
