import {expect, test} from 'bun:test'
import {integer} from '../sqlite/SqliteColumns.ts'
import {sql} from './Sql.ts'
import {table} from './Table.ts'

const Node = table(
  'Node',
  class {
    id = integer().primaryKey()
  }
)

test('format table and column name', () => {
  expect(sql.inline(Node.id)).toBe('"Node"."id"')
})
