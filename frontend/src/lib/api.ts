let accessToken: string | null = null
let refreshToken: string | null = null
let refreshPromise: Promise<boolean> | null = null
let proactiveRefreshTimer: ReturnType<typeof setTimeout> | null = null

export function getAccessToken(): string | null { return accessToken }

export function setTokens(access: string, refresh: string): void {
  accessToken = access
  refreshToken = refresh
  localStorage.setItem('refresh_token', refresh)
  scheduleProactiveRefresh()
}

export function clearTokens(): void {
  accessToken = null
  refreshToken = null
  localStorage.removeItem('refresh_token')
  if (proactiveRefreshTimer) {
    clearTimeout(proactiveRefreshTimer)
    proactiveRefreshTimer = null
  }
}

export function getStoredRefreshToken(): string | null {
  return refreshToken ?? localStorage.getItem('refresh_token')
}

function getAccessTokenExpiry(): number | null {
  const token = getAccessToken()
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.exp as number
  } catch {
    return null
  }
}

function scheduleProactiveRefresh(): void {
  if (proactiveRefreshTimer) clearTimeout(proactiveRefreshTimer)
  const exp = getAccessTokenExpiry()
  if (!exp) return
  const now = Math.floor(Date.now() / 1000)
  const remaining = exp - now
  const refreshIn = remaining * 0.2  // fire when 20% remains (= 80% elapsed)
  if (refreshIn <= 0) {
    refreshAccessToken()
    return
  }
  proactiveRefreshTimer = setTimeout(() => {
    refreshAccessToken().then((ok) => {
      if (ok) scheduleProactiveRefresh()
    })
  }, refreshIn * 1000)
}

async function _doRefresh(): Promise<boolean> {
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

export async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise
  refreshPromise = _doRefresh().finally(() => {
    refreshPromise = null
  })
  return refreshPromise
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

  if (res.status === 401) {
    clearTokens()
    window.location.href = '/login'
    throw new Error('Session expired')
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
  }

  return res.json()
}

// Refresh on tab restore if token is past 80% lifetime (SES-05 complement)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return
  const exp = getAccessTokenExpiry()
  if (!exp) return
  const now = Math.floor(Date.now() / 1000)
  const total = 60 * 60  // 3600s — access token lifetime
  const issuedAt = exp - total
  const elapsed = now - issuedAt
  if (elapsed / total >= 0.8) {
    refreshAccessToken()
  }
})

// authReady resolves once the initial refresh attempt completes.
// Route guards must await this before checking getAccessToken() to avoid
// a false-redirect on page refresh (token is null until async refresh finishes).
export const authReady: Promise<void> = getStoredRefreshToken()
  ? refreshAccessToken().then((ok) => { if (ok) scheduleProactiveRefresh() })
  : Promise.resolve()
