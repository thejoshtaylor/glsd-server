import { createRootRoute, Link, Outlet, useNavigate } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '../lib/queryClient'
import { getAccessToken, clearTokens } from '../lib/api'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const navigate = useNavigate()
  const isLoggedIn = !!getAccessToken()

  const handleLogout = () => {
    clearTokens()
    queryClient.clear()
    navigate({ to: '/login', search: { redirect: undefined } })
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-screen bg-gray-950 text-gray-100">
        {isLoggedIn && (
          <aside className="w-56 border-r border-gray-800 bg-gray-900 flex flex-col">
            <div className="p-4 border-b border-gray-800">
              <h1 className="text-lg font-bold text-white">GLSD</h1>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              <Link
                to="/dashboard"
                className="block px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-800 hover:text-white [&.active]:bg-gray-800 [&.active]:text-white"
              >
                Dashboard
              </Link>
              <Link
                to="/dashboard/audit"
                className="block px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-800 hover:text-white [&.active]:bg-gray-800 [&.active]:text-white"
              >
                Audit Log
              </Link>
            </nav>
            <div className="p-3 border-t border-gray-800">
              <Button variant="ghost" size="sm" className="w-full justify-start text-gray-400" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </Button>
            </div>
          </aside>
        )}
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </QueryClientProvider>
  )
}
