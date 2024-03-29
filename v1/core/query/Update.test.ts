import {expect, test} from 'bun:test'
import {integer} from '../../sqlite/SqliteColumns.ts'
import {sql} from '../Sql.ts'
import {table} from '../Table.ts'
import {update} from './Update.ts'

const definition = {
  id: integer().primaryKey(),
  withDefault: integer().default(2),
  required: integer().notNull(),
  nullable: integer()
}

const Node = table('Node', definition)

test('update', () => {
  const query = update(Node).set({
    nullable: null,
    required: 3,
    withDefault: sql<number>`${Node.required} + 1`
  })
  expect(sql.test(query)).toBe(
    'update "Node" set "nullable" = null, "required" = 3, "withDefault" = "required" + 1'
  )
})
