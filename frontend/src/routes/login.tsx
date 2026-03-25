import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useRef, useEffect } from 'react'
import { setTokens } from '../lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { TokenResponse } from '../types/api'

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: (search.redirect as string) || undefined,
  }),
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [glitching, setGlitching] = useState(false)
  const glitchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup glitch timeout on unmount (prevents state-on-unmounted-component errors)
  useEffect(() => {
    return () => {
      if (glitchTimeoutRef.current) clearTimeout(glitchTimeoutRef.current)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const params = new URLSearchParams()
      params.set('username', email)
      params.set('password', password)

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: 'Login failed' }))
        setError(data.detail || 'Login failed')
        return
      }

      const data: TokenResponse = await res.json()
      setTokens(data.access_token, data.refresh_token)

      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (!reducedMotion) {
        setGlitching(true)
        glitchTimeoutRef.current = setTimeout(() => {
          navigate({ to: search.redirect || '/dashboard' })
        }, 300)
      } else {
        navigate({ to: search.redirect || '/dashboard' })
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="flex items-center justify-center h-full bg-background animate-in fade-in duration-150 fill-mode-both"
      style={{
        backgroundImage: `
          repeating-linear-gradient(0deg, oklch(0.75 0.18 195 / 5%) 0px, oklch(0.75 0.18 195 / 5%) 1px, transparent 1px, transparent 40px),
          repeating-linear-gradient(90deg, oklch(0.75 0.18 195 / 5%) 0px, oklch(0.75 0.18 195 / 5%) 1px, transparent 1px, transparent 40px)
        `,
      }}
    >
      <div className={`login-card-border w-full max-w-sm ${glitching ? 'glitch-once' : ''}`}>
        <Card className="w-full bg-card border-0 ring-0">
          <CardHeader>
            <CardTitle
              className="text-center text-foreground font-heading text-[28px]"
              style={{
                textShadow: '0 0 10px oklch(0.75 0.18 195), 0 0 20px oklch(0.75 0.18 195 / 70%), 0 0 40px oklch(0.75 0.18 195 / 40%)',
              }}
            >
              GLSD Server
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-muted border-border text-foreground"
              />
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-muted border-border text-foreground"
              />
              {error && <p className="text-sm text-red-400">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
