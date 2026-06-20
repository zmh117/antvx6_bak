import type { Cell, Edge } from '@antv/x6'

import type { BusinessFlowNodeErRef } from '@/entities/business-flow'
import { readCellData } from '@/features/business-flow/infrastructure/x6/businessFlowX6'

export type ErGraphOption = { id: string; name: string }

export type SelectedBusinessCell =
  | { kind: 'lane'; cell: Cell; displayName: string; ownerRole: string }
  | {
      kind: 'node'
      cell: Cell
      title: string
      description: string
      actor: string
      businessRule: string
      erRefs: BusinessFlowNodeErRef[]
    }
  | { kind: 'edge'; cell: Edge; label: string }
  | null

export function readSelectedBusinessCell(cell: Cell): SelectedBusinessCell {
  const data = readCellData(cell)
  if (cell.isEdge()) {
    return {
      kind: 'edge',
      cell: cell as Edge,
      label: data.title ?? '',
    }
  }
  if (data.cellRole === 'LANE_INSTANCE') {
    return {
      kind: 'lane',
      cell,
      displayName: String(cell.attr('label/text') ?? data.title ?? ''),
      ownerRole: String(cell.attr('owner/text') ?? ''),
    }
  }
  if (data.cellRole === 'FLOW_NODE') {
    return {
      kind: 'node',
      cell,
      title: data.title ?? String(cell.attr('label/text') ?? ''),
      description: data.description ?? '',
      actor: data.actor ?? '',
      businessRule: data.businessRule ?? '',
      erRefs: data.erRefs ?? [],
    }
  }
  return null
}
