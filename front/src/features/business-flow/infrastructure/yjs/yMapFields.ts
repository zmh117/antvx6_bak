import * as Y from 'yjs'

export function patchYMapObjectFields(
  target: Y.Map<unknown>,
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
) {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)])
  keys.forEach((key) => {
    if (JSON.stringify(previous[key]) === JSON.stringify(next[key])) return
    if (next[key] === undefined) target.delete(key)
    else target.set(key, next[key])
  })
}
