import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { authReady, getAccessToken } from '@/lib/api'
import { useWebSocket } from '@/hooks/useWebSocket'

export const Route = createFileRoute('/dashboard')({
  beforeLoad: async ({ location }) => {
    await authReady
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
