import { config } from './config.js'
import { projectionFromDoc } from './graphProjection.js'
import { businessFlowProjectionFromDoc } from './businessFlowProjection.js'

export async function materializeGraph(graphId, doc, context = {}, collabRevision = null) {
  const projection = projectionFromDoc(doc)
  const response = await fetch(`${config.apiBase}/api/graphs/${graphId}/internal/materialize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Token': config.internalToken,
    },
    body: JSON.stringify({
      ...projection,
      clientId: context.clientId || 'collab-sidecar',
      userId: context.userId,
      collabRevision,
      operationSource: 'collab_auto_save',
    }),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`materialize failed ${response.status}: ${text}`)
  }
  return response.json()
}

export async function materializeBusinessFlow(
  businessFlowId,
  doc,
  context = {},
  collabRevision = null,
) {
  const projection = businessFlowProjectionFromDoc(doc)
  const response = await fetch(
    `${config.apiBase}/api/business-flows/${businessFlowId}/internal/materialize`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': config.internalToken,
      },
      body: JSON.stringify({
        ...projection,
        clientId: context.clientId || 'collab-sidecar',
        userId: context.userId,
        collabRevision,
        operationSource: 'collab_auto_save',
      }),
    },
  )
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`business flow materialize failed ${response.status}: ${text}`)
  }
  return response.json()
}

export async function materializeCollabDocument(ref, doc, context = {}) {
  if (ref.documentType === 'BUSINESS_FLOW') {
    return materializeBusinessFlow(
      ref.businessFlowId,
      doc,
      context,
      ref.collabRevision,
    )
  }
  return materializeGraph(ref.graphId, doc, context, ref.collabRevision)
}
