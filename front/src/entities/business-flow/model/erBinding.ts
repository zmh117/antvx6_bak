import type {
  BusinessFlowErRefType,
  BusinessFlowNodeErRef,
} from './types'

export function appendNodeErFieldBindings(
  existing: BusinessFlowNodeErRef[],
  selection: {
    erDiagramId: string
    erTableKey: string
    erColumnKeys: string[]
    manualColumnKey?: string
    refType: BusinessFlowErRefType
  },
) {
  const erDiagramId = selection.erDiagramId.trim()
  const erTableKey = selection.erTableKey.trim()
  if (!erDiagramId || !erTableKey) return existing

  const selectedColumnKeys = [
    ...selection.erColumnKeys.map((key) => key.trim()).filter(Boolean),
    ...(selection.manualColumnKey?.trim() ? [selection.manualColumnKey.trim()] : []),
  ]
  const columnKeys: Array<string | null> = selectedColumnKeys.length
    ? Array.from(new Set(selectedColumnKeys))
    : [null]
  const signatures = new Set(
    existing.map((ref) =>
      `${ref.erDiagramId}:${ref.erTableKey}:${ref.erColumnKey ?? ''}:${ref.refType}`,
    ),
  )
  const additions = columnKeys.flatMap((erColumnKey) => {
    const signature = `${erDiagramId}:${erTableKey}:${erColumnKey ?? ''}:${selection.refType}`
    if (signatures.has(signature)) return []
    signatures.add(signature)
    return [{
      erDiagramId,
      erTableKey,
      erColumnKey,
      refType: selection.refType,
      description: null,
    }]
  })
  return [...existing, ...additions]
}
