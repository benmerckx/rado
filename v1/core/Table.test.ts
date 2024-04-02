import {expect, test} from 'bun:test'
import {integer} from '../sqlite/SqliteColumns.ts'
import {emit} from '../test/TestUtils.ts'
import {table} from './Table.ts'

const Node = table('Node', {
  id: integer().primaryKey()
})

test('format table and column name', () => {
  expect(emit(Node.id)).toBe('"Node"."id"')
})
