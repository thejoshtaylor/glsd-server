import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { getAccessToken } from '@/lib/api'

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
  return <Outlet />
}
