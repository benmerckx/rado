import {expect, test} from 'bun:test'
import {sql} from '../Sql.ts'
import {table} from '../Table.ts'
import {integer} from '../sqlite/SqliteColumns.ts'
import {Select} from './Select.ts'

const Node = table('Node', {
  id: integer().primaryKey()
})

test('a union b', () => {
  const a = new Select().from(Node)
  const b = new Select().from(Node)
  const query = a.union(b)
  expect(sql.inline(query)).toBe(
    'select "id" from "Node" union select "id" from "Node"'
  )
})
