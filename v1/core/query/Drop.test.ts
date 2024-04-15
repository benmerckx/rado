import {expect, test} from 'bun:test'
import {integer} from '../../sqlite/SqliteColumns.ts'
import {builder, emit} from '../../test/TestUtils.ts'
import {table} from '../Table.ts'

const Node = table('Node', {
  id: integer().primaryKey()
})

test('drop table', () => {
  const query = builder.drop(Node)
  expect(emit(query)).toBe('drop table "Node"')
})

test('if not exists', () => {
  const query = builder.drop(Node).ifExists()
  expect(emit(query)).toBe('drop table if exists "Node"')
})
