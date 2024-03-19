import {expect, test} from 'bun:test'
import {integer} from '../../sqlite/SqliteColumns.ts'
import {sql} from '../Sql.ts'
import {table} from '../Table.ts'
import {InsertInto} from './Insert.ts'

const definition = {
  id: integer().primaryKey(),
  withDefault: integer().default(2),
  required: integer().notNull(),
  nullable: integer()
}

const Node = table('Node', definition)

const insert = new InsertInto<typeof definition, undefined>({into: Node})
const query = insert.values({id: 1, required: 3})

test('insert into', () => {
  expect(sql.inline(query)).toBe(
    'insert into "Node"("id", "withDefault", "required", "nullable") values (1, 2, 3, default)'
  )
})

test('returning', () => {
  expect(sql.inline(query.returning(Node.id))).toBe(
    'insert into "Node"("id", "withDefault", "required", "nullable") values (1, 2, 3, default) returning "id"'
  )
})
