import {expect, test} from 'bun:test'
import {integer} from '../../sqlite/SqliteColumns.ts'
import {builder, emit} from '../../test/TestUtils.ts'
import {table} from '../Table.ts'

const definition = {
  id: integer().primaryKey(),
  withDefault: integer().default(2),
  required: integer().notNull(),
  nullable: integer()
}

const Node = table('Node', definition)

const query = builder.insert(Node).values({id: 1, required: 3})

test('insert into', () => {
  expect(emit(query)).toBe(
    'insert into "Node"("id", "withDefault", "required", "nullable") values (1, 2, 3, default)'
  )
})

test('returning', () => {
  expect(emit(query.returning(Node.id))).toBe(
    'insert into "Node"("id", "withDefault", "required", "nullable") values (1, 2, 3, default) returning "id"'
  )
})
