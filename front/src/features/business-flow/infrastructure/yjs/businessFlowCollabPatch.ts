import * as Y from 'yjs'

export const BUSINESS_FLOW_COLLAB_MAPS = ['lanes', 'nodes', 'edges', 'erRefs', 'meta'] as const

export type BusinessFlowCollabMapName = (typeof BUSINESS_FLOW_COLLAB_MAPS)[number]
export type BusinessFlowCollabPatchKind = 'lane' | 'node' | 'edge' | 'erRef' | 'meta'
export type BusinessFlowCollabPatchAction = 'upsert' | 'delete' | 'update'

export type BusinessFlowCollabPatchEntry = {
  kind: BusinessFlowCollabPatchKind
  key: string
  action: BusinessFlowCollabPatchAction
  affectedNodeKey?: string
}

export type BusinessFlowCollabFallbackReason =
  | 'initial-load'
  | 'empty-transaction'
  | 'large-transaction'
  | 'unknown-shared-type'
  | 'meta-structural-change'

export type BusinessFlowCollabPatchPlan = {
  entries: BusinessFlowCollabPatchEntry[]
  fallbackReason?: BusinessFlowCollabFallbackReason
}

export type BusinessFlowCollabPatchOptions = {
  maxIncrementalEntries?: number
  allowMetaOnly?: boolean
}

const DEFAULT_MAX_INCREMENTAL_ENTRIES = 20

type YMapKeyChange = {
  action: 'add' | 'update' | 'delete'
  oldValue?: unknown
}

function yMapKeyChanges(event: Y.YEvent<Y.Map<unknown>>) {
  return event.changes.keys as Map<string, YMapKeyChange>
}

function mapObject(value: unknown): Record<string, unknown> {
  if (!value) return {}
  if (value instanceof Y.Map) return Object.fromEntries(value.entries())
  return typeof value === 'object' ? { ...(value as Record<string, unknown>) } : {}
}

function patchAction(action: YMapKeyChange['action']): BusinessFlowCollabPatchAction {
  return action === 'delete' ? 'delete' : 'upsert'
}

function erRefAffectedNodeKey(key: string, nextValue: unknown, oldValue: unknown) {
  const next = mapObject(nextValue)
  const old = mapObject(oldValue)
  const nodeKey = next.node_key ?? next.nodeKey ?? old.node_key ?? old.nodeKey
  if (typeof nodeKey === 'string' && nodeKey) return nodeKey
  const separator = key.indexOf(':')
  return separator > 0 ? key.slice(0, separator) : undefined
}

function isBusinessFlowRootMap(doc: Y.Doc, type: Y.AbstractType<any>) {
  return BUSINESS_FLOW_COLLAB_MAPS.some((name) => doc.getMap(name) === (type as unknown))
}

function mapEvents(
  transaction: Y.Transaction,
  map: Y.Map<unknown>,
): Y.YEvent<Y.Map<unknown>>[] {
  const events = transaction.changedParentTypes.get(map as unknown as Y.AbstractType<any>)
  if (!events) return []
  return events.filter((event): event is Y.YEvent<Y.Map<unknown>> => event.target === map)
}

export function deriveBusinessFlowCollabPatchPlan(
  doc: Y.Doc,
  transaction: Y.Transaction,
  options: BusinessFlowCollabPatchOptions = {},
): BusinessFlowCollabPatchPlan {
  const maxEntries = options.maxIncrementalEntries ?? DEFAULT_MAX_INCREMENTAL_ENTRIES
  const entries: BusinessFlowCollabPatchEntry[] = []
  let touchedKnownRoot = false

  for (const [type] of transaction.changedParentTypes) {
    if (!isBusinessFlowRootMap(doc, type)) {
      return { entries: [], fallbackReason: 'unknown-shared-type' }
    }
  }

  const collectRootMap = (
    mapName: 'lanes' | 'nodes' | 'edges',
    kind: 'lane' | 'node' | 'edge',
  ) => {
    const root = doc.getMap(mapName)
    for (const event of mapEvents(transaction, root)) {
      touchedKnownRoot = true
      for (const [key, change] of yMapKeyChanges(event)) {
        entries.push({ kind, key, action: patchAction(change.action) })
      }
    }
  }

  collectRootMap('lanes', 'lane')
  collectRootMap('nodes', 'node')
  collectRootMap('edges', 'edge')

  const erRefs = doc.getMap('erRefs')
  for (const event of mapEvents(transaction, erRefs)) {
    touchedKnownRoot = true
    for (const [key, change] of yMapKeyChanges(event)) {
      entries.push({
        kind: 'erRef',
        key,
        action: patchAction(change.action),
        affectedNodeKey: erRefAffectedNodeKey(key, erRefs.get(key), change.oldValue),
      })
    }
  }

  const meta = doc.getMap('meta')
  for (const event of mapEvents(transaction, meta)) {
    touchedKnownRoot = true
    for (const [key] of yMapKeyChanges(event)) {
      if (key === 'updatedAt' && options.allowMetaOnly !== false) {
        entries.push({ kind: 'meta', key, action: 'update' })
        continue
      }
      return { entries: [], fallbackReason: 'meta-structural-change' }
    }
  }

  if (!touchedKnownRoot || entries.length === 0) {
    return { entries: [], fallbackReason: 'empty-transaction' }
  }
  const materialEntries = entries.filter((entry) => entry.kind !== 'meta')
  if (materialEntries.length > maxEntries) {
    return { entries, fallbackReason: 'large-transaction' }
  }
  return { entries }
}

export function compactBusinessFlowCollabPatchPlan(
  plan: BusinessFlowCollabPatchPlan,
): BusinessFlowCollabPatchPlan {
  if (plan.fallbackReason) return plan
  const byEntry = new Map<string, BusinessFlowCollabPatchEntry>()
  for (const entry of plan.entries) {
    byEntry.set(`${entry.kind}:${entry.key}`, entry)
  }
  return { entries: Array.from(byEntry.values()) }
}
