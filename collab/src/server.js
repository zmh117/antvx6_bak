import { Server } from '@hocuspocus/server'
import { config } from './config.js'
import {
  appendYUpdate,
  getMembership,
  isCurrentCollabRevision,
  loadYDoc,
  parseCollabDocumentName,
  storeYDoc,
} from './db.js'
import { clientIdForUser, verifyJwt } from './jwt.js'
import { materializeCollabDocument } from './materialize.js'

const ROLE_RANK = { viewer: 1, editor: 2, owner: 3 }

const server = new Server({
  port: config.port,
  debounce: 2000,
  maxDebounce: 10000,
  async onAuthenticate(data) {
    const docRef = parseCollabDocumentName(data.documentName)
    const payload = verifyJwt(data.token)
    const role = await getMembership(docRef, payload.sub)
    if (!role) throw new Error('graph access denied')
    if (!(await isCurrentCollabRevision(docRef))) {
      throw new Error('stale collab document')
    }
    if (ROLE_RANK[role] < ROLE_RANK.editor) {
      data.connectionConfig.readOnly = true
    }
    return {
      documentType: docRef.documentType,
      ownerType: docRef.ownerType,
      ownerId: docRef.ownerId,
      graphId: docRef.graphId,
      businessFlowId: docRef.businessFlowId,
      userId: payload.sub,
      email: payload.email,
      displayName: payload.name || payload.email,
      role,
      collabRevision: docRef.collabRevision,
      clientId: clientIdForUser(payload),
    }
  },
  async onLoadDocument(data) {
    const docRef = parseCollabDocumentName(data.documentName)
    if (!(await isCurrentCollabRevision(docRef))) {
      throw new Error('stale collab document')
    }
    return loadYDoc(docRef)
  },
  async onChange(data) {
    const docRef = parseCollabDocumentName(data.documentName)
    if (!(await isCurrentCollabRevision(docRef))) return
    if (data.update) {
      await appendYUpdate(
        docRef,
        data.update,
        data.context,
        String(data.transactionOrigin || 'remote'),
      )
    }
  },
  async onStoreDocument(data) {
    const docRef = parseCollabDocumentName(data.documentName)
    if (!(await isCurrentCollabRevision(docRef))) return
    await storeYDoc(docRef, data.document)
    try {
      await materializeCollabDocument(docRef, data.document, data.lastContext)
    } catch (error) {
      console.error('[collab] materialize failed', error)
    }
  },
})

server.listen()
console.log(`[collab] Hocuspocus listening on ws://127.0.0.1:${config.port}`)
