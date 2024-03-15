import {expect, test} from 'bun:test'
import {sql} from '../Sql.ts'
import {table} from '../Table.ts'
import {integer} from '../sqlite/SqliteColumns.ts'
import {Select} from './Select.ts'

const Node = table('Node', {
  id: integer().primaryKey()
})

test('select all available columns', () => {
  const query = new Select().from(Node)
  expect(sql.inline(query)).toBe('select "id" from "Node"')
})
