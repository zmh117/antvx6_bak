import { Server } from '@hocuspocus/server'
import { config } from './config.js'
import {
  appendYUpdate,
  getMembership,
  isCurrentCollabRevision,
  loadYDoc,
  parseGraphDocumentName,
  storeYDoc,
} from './db.js'
import { clientIdForUser, verifyJwt } from './jwt.js'
import { materializeGraph } from './materialize.js'

const ROLE_RANK = { viewer: 1, editor: 2, owner: 3 }

const server = new Server({
  port: config.port,
  debounce: 2000,
  maxDebounce: 10000,
  async onAuthenticate(data) {
    const { graphId, collabRevision } = parseGraphDocumentName(data.documentName)
    const payload = verifyJwt(data.token)
    const role = await getMembership(graphId, payload.sub)
    if (!role) throw new Error('graph access denied')
    if (!(await isCurrentCollabRevision(graphId, collabRevision))) {
      throw new Error('stale collab document')
    }
    if (ROLE_RANK[role] < ROLE_RANK.editor) {
      data.connectionConfig.readOnly = true
    }
    return {
      graphId,
      userId: payload.sub,
      email: payload.email,
      displayName: payload.name || payload.email,
      role,
      collabRevision,
      clientId: clientIdForUser(payload),
    }
  },
  async onLoadDocument(data) {
    const { graphId, collabRevision } = parseGraphDocumentName(data.documentName)
    if (!(await isCurrentCollabRevision(graphId, collabRevision))) {
      throw new Error('stale collab document')
    }
    return loadYDoc(graphId, collabRevision)
  },
  async onChange(data) {
    const { graphId, collabRevision } = parseGraphDocumentName(data.documentName)
    if (!(await isCurrentCollabRevision(graphId, collabRevision))) return
    if (data.update) {
      await appendYUpdate(
        graphId,
        data.update,
        data.context,
        String(data.transactionOrigin || 'remote'),
      )
    }
  },
  async onStoreDocument(data) {
    const { graphId, collabRevision } = parseGraphDocumentName(data.documentName)
    if (!(await isCurrentCollabRevision(graphId, collabRevision))) return
    await storeYDoc(graphId, data.document)
    try {
      await materializeGraph(graphId, data.document, data.lastContext, collabRevision)
    } catch (error) {
      console.error('[collab] materialize failed', error)
    }
  },
})

server.listen()
console.log(`[collab] Hocuspocus listening on ws://127.0.0.1:${config.port}`)
