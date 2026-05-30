const TOKEN_KEY = 'antvx6.auth.token'
const USER_KEY = 'antvx6.auth.user'

export type CurrentUser = {
  id: string
  email: string
  display_name: string
}

let accessToken: string | null = localStorage.getItem(TOKEN_KEY)
let currentUser: CurrentUser | null = (() => {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as CurrentUser
  } catch {
    return null
  }
})()

const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

export function getAccessToken() {
  return accessToken
}

export function getCurrentUser() {
  return currentUser
}

export function setAuthSession(token: string, user: CurrentUser) {
  accessToken = token
  currentUser = user
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  notify()
}

export function clearAuthSession() {
  accessToken = null
  currentUser = null
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  notify()
}

export function subscribeAuth(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function authHeaders(): HeadersInit {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
}
