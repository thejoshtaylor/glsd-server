import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { getAccessToken } from '@/lib/api'
import { useWebSocket } from '@/hooks/useWebSocket'

export const Route = createFileRoute('/dashboard')({
  beforeLoad: ({ location }) => {
    if (!getAccessToken()) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
  },
  component: DashboardLayout,
})

function DashboardLayout() {
  useWebSocket()
  return <Outlet />
}
