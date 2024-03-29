import {expect, test} from 'bun:test'
import {integer} from '../sqlite/SqliteColumns.ts'
import {sql} from './Sql.ts'
import {table} from './Table.ts'

const Node = table('Node', {
  id: integer().primaryKey()
})

test('format table and column name', () => {
  expect(sql.test(Node.id)).toBe('"Node"."id"')
})
