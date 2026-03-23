let accessToken: string | null = null
let refreshToken: string | null = null

export function getAccessToken(): string | null { return accessToken }

export function setTokens(access: string, refresh: string): void {
  accessToken = access
  refreshToken = refresh
  localStorage.setItem('refresh_token', refresh)
}

export function clearTokens(): void {
  accessToken = null
  refreshToken = null
  localStorage.removeItem('refresh_token')
}

export function getStoredRefreshToken(): string | null {
  return refreshToken ?? localStorage.getItem('refresh_token')
}

async function refreshAccessToken(): Promise<boolean> {
  const rt = getStoredRefreshToken()
  if (!rt) return false
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    })
    if (!res.ok) { clearTokens(); return false }
    const data = await res.json()
    setTokens(data.access_token, data.refresh_token)
    return true
  } catch {
    clearTokens()
    return false
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  if (!headers.has('Content-Type') && options.body) headers.set('Content-Type', 'application/json')

  let res = await fetch(path, { ...options, headers })

  if (res.status === 401 && accessToken) {
    const refreshed = await refreshAccessToken()
    if (refreshed) {
      headers.set('Authorization', `Bearer ${accessToken}`)
      res = await fetch(path, { ...options, headers })
    }
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
  }

  return res.json()
}
