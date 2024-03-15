import {expect, test} from 'bun:test'
import {sql} from './Sql.ts'
import {table} from './Table.ts'
import {integer} from './sqlite/SqliteColumns.ts'

const Node = table('Node', {
  id: integer().primaryKey()
})

test('format table and column name', () => {
  expect(sql.inline(Node.id)).toBe('"Node"."id"')
})
