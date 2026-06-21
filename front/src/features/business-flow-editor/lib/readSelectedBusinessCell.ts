import type { Cell, Edge } from '@antv/x6'

import type {
  BpmnEdgeProfile,
  BpmnNodeProfile,
  BusinessFlowNodeErRef,
  MesSemantics,
} from '@/entities/business-flow'
import {
  normalizeBpmnEdgeProfile,
  normalizeBpmnNodeProfile,
  normalizeMesSemantics,
} from '@/entities/business-flow'
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
      inputSummary: string
      outputSummary: string
      bpmnProfile: BpmnNodeProfile
      mesSemantics: MesSemantics
      erRefs: BusinessFlowNodeErRef[]
    }
  | {
      kind: 'edge'
      cell: Edge
      label: string
      bpmnProfile: BpmnEdgeProfile
      mesSemantics: MesSemantics
    }
  | null

export function readSelectedBusinessCell(cell: Cell): SelectedBusinessCell {
  const data = readCellData(cell)
  if (cell.isEdge()) {
    const bpmnProfile = normalizeBpmnEdgeProfile({
      edgeType: data.edgeType,
      bpmnFlowType: data.bpmnFlowType,
      bpmnSequenceFlowKind: data.bpmnSequenceFlowKind,
      bpmnMessageName: data.bpmnMessageName,
      bpmnConditionExpression: data.bpmnConditionExpression,
      propertiesJson: data.propertiesJson,
    })
    return {
      kind: 'edge',
      cell: cell as Edge,
      label: data.title ?? '',
      bpmnProfile,
      mesSemantics: normalizeMesSemantics(data.mesSemantics, data.propertiesJson),
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
    const bpmnProfile = normalizeBpmnNodeProfile({
      nodeType: data.nodeType,
      bpmnElementType: data.bpmnElementType,
      bpmnEventKind: data.bpmnEventKind,
      bpmnEventDefinition: data.bpmnEventDefinition,
      bpmnTaskType: data.bpmnTaskType,
      bpmnGatewayType: data.bpmnGatewayType,
      bpmnSubProcessKind: data.bpmnSubProcessKind,
      bpmnCallActivityRef: data.bpmnCallActivityRef,
      bpmnBoundaryAttachedToNodeKey: data.bpmnBoundaryAttachedToNodeKey,
      propertiesJson: data.propertiesJson,
    })
    return {
      kind: 'node',
      cell,
      title: data.title ?? String(cell.attr('label/text') ?? ''),
      description: data.description ?? '',
      actor: data.actor ?? '',
      businessRule: data.businessRule ?? '',
      inputSummary: data.inputSummary ?? '',
      outputSummary: data.outputSummary ?? '',
      bpmnProfile,
      mesSemantics: normalizeMesSemantics(data.mesSemantics, data.propertiesJson),
      erRefs: data.erRefs ?? [],
    }
  }
  return null
}
