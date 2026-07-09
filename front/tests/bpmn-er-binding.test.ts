import assert from 'node:assert/strict'
import test from 'node:test'

import { appendNodeErFieldBindings } from '../src/entities/business-flow/model/erBinding.js'

test('adds multiple selected ER fields and removes duplicate bindings', () => {
  const refs = appendNodeErFieldBindings(
    [{
      erDiagramId: 'er-1',
      erTableKey: 'orders',
      erColumnKey: 'id',
      refType: 'READ',
      description: null,
    }],
    {
      erDiagramId: 'er-1',
      erTableKey: 'orders',
      erColumnKeys: ['id', 'status', 'status'],
      manualColumnKey: 'created_at',
      refType: 'READ',
    },
  )

  assert.deepEqual(
    refs.map((ref) => ref.erColumnKey),
    ['id', 'status', 'created_at'],
  )
})

test('keeps whole-table binding when no field is selected', () => {
  const refs = appendNodeErFieldBindings([], {
    erDiagramId: 'er-1',
    erTableKey: 'orders',
    erColumnKeys: [],
    refType: 'CHECK',
  })
  assert.equal(refs.length, 1)
  assert.equal(refs[0].erColumnKey, null)
})
