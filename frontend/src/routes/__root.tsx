import { createRootRoute, Link, Outlet, useNavigate } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '../lib/queryClient'
import { getAccessToken, clearTokens } from '../lib/api'
import { LogOut, BookOpen } from '@/lib/icons'
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
      <div className="flex h-screen bg-background text-foreground">
        {isLoggedIn && (
          <aside className="w-56 border-r border-border bg-sidebar flex flex-col">
            <div className="p-4 border-b border-border">
              <h1 className="text-lg font-bold font-heading text-foreground">GLSD</h1>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              <Link
                to="/dashboard"
                className="block px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground [&.active]:bg-muted [&.active]:text-foreground"
              >
                Dashboard
              </Link>
              <Link
                to="/dashboard/audit"
                className="block px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground [&.active]:bg-muted [&.active]:text-foreground"
              >
                Audit Log
              </Link>
              <Link
                to="/dashboard/onboarding"
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground [&.active]:bg-muted [&.active]:text-foreground"
              >
                <BookOpen size={16} />
                Getting Started
              </Link>
            </nav>
            <div className="p-3 border-t border-border">
              <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={handleLogout}>
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
