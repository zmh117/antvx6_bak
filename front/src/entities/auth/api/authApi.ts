import { API_BASE } from '@/shared/api/config'
import { authHeaders, type CurrentUser } from '../model/authStore'

export type AuthResponse = {
  access_token: string
  token_type: 'bearer'
  user: CurrentUser
}

async function parseAuthResponse(res: Response): Promise<AuthResponse> {
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<AuthResponse>
}

export async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return parseAuthResponse(res)
}

export async function register(email: string, password: string, displayName: string) {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, display_name: displayName }),
  })
  return parseAuthResponse(res)
}

export async function fetchMe() {
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    headers: { ...authHeaders() },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<CurrentUser>
}

export async function fetchActiveUsers(query = '') {
  const params = new URLSearchParams()
  if (query.trim()) params.set('q', query.trim())
  const qs = params.toString()
  const res = await fetch(`${API_BASE}/api/auth/users${qs ? `?${qs}` : ''}`, {
    headers: { ...authHeaders() },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<CurrentUser[]>
}
