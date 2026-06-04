export type ErViewportMode = 'overview' | 'detail'

export const ER_VIEWPORT_SCALE = {
  overviewEnter: 0.58,
  detailEnter: 0.68,
  searchFocus: 0.9,
} as const

let currentMode: ErViewportMode = 'detail'
const listeners = new Set<() => void>()

export function getErViewportModeSnapshot(): ErViewportMode {
  return currentMode
}

export function subscribeErViewportMode(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function isErDetailMode(): boolean {
  return currentMode === 'detail'
}

export function resolveErViewportMode(scale: number, previous = currentMode): ErViewportMode {
  if (scale <= ER_VIEWPORT_SCALE.overviewEnter) return 'overview'
  if (scale >= ER_VIEWPORT_SCALE.detailEnter) return 'detail'
  return previous
}

export function setErViewportMode(next: ErViewportMode): ErViewportMode {
  if (next === currentMode) return currentMode
  currentMode = next
  listeners.forEach((listener) => listener())
  return currentMode
}

export function updateErViewportModeFromScale(scale: number): ErViewportMode {
  return setErViewportMode(resolveErViewportMode(scale, currentMode))
}
