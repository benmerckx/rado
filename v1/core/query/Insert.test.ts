import {expect, test} from 'bun:test'
import {integer} from '../../sqlite/SqliteColumns.ts'
import {sql} from '../Sql.ts'
import {table} from '../Table.ts'
import {insert} from './Insert.ts'

const definition = {
  id: integer().primaryKey(),
  withDefault: integer().default(2),
  required: integer().notNull(),
  nullable: integer()
}

const Node = table('Node', definition)

const query = insert(Node).values({id: 1, required: 3})

test('insert into', () => {
  expect(sql.test(query)).toBe(
    'insert into "Node"("id", "withDefault", "required", "nullable") values (1, 2, 3, default)'
  )
})

test('returning', () => {
  expect(sql.test(query.returning(Node.id))).toBe(
    'insert into "Node"("id", "withDefault", "required", "nullable") values (1, 2, 3, default) returning "id"'
  )
})
