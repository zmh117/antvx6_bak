import { config } from './config.js'
import { projectionFromDoc } from './graphProjection.js'

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
