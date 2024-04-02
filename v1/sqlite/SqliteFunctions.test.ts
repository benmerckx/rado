import {expect, test} from 'bun:test'
import {table} from '../core/Table.ts'
import {emit} from '../test/TestUtils.ts'
import {integer} from './SqliteColumns.ts'
import {bm25, cast} from './SqliteFunctions.ts'

const Node = table('Node', {
  id: integer().primaryKey()
})

test('eq', () => {
  expect(emit(bm25(Node, 1, 2))).toBe('"bm25"("Node", 1, 2)')
})

test('cast', () => {
  expect(emit(cast(123, 'text'))).toBe('cast(123 as "text")')
})
