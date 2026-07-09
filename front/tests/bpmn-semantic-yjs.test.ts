import assert from 'node:assert/strict'
import test from 'node:test'
import * as Y from 'yjs'

import { patchYMapObjectFields } from '../src/features/business-flow/infrastructure/yjs/yMapFields.js'

test('patches only changed semantic fields in a nested Yjs map', () => {
  const doc = new Y.Doc()
  const target = new Y.Map<unknown>()
  doc.getMap('semantics').set('node-1', target)
  target.set('eventName', '订单开始')
  target.set('triggerSource', '前端')
  target.set('startCondition', '旧条件')

  patchYMapObjectFields(
    target,
    {
      eventName: '订单开始',
      triggerSource: '前端',
      startCondition: '旧条件',
    },
    {
      eventName: '订单开始',
      triggerSource: '前端',
      startCondition: '收到订单消息',
    },
  )

  assert.equal(target.get('eventName'), '订单开始')
  assert.equal(target.get('triggerSource'), '前端')
  assert.equal(target.get('startCondition'), '收到订单消息')
})
