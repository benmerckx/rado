import {expect, test} from 'bun:test'
import {sql} from '../core/Sql.ts'
import {table} from '../core/Table.ts'
import {integer} from './SqliteColumns.ts'
import {bm25, cast} from './SqliteFunctions.ts'

const Node = table('Node', {
  id: integer().primaryKey()
})

test('eq', () => {
  expect(sql.test(bm25(Node, 1, 2))).toBe('"bm25"("Node", 1, 2)')
})

test('cast', () => {
  expect(sql.test(cast(123, 'text'))).toBe('cast(123 as "text")')
})
