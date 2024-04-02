import {expect, test} from 'bun:test'
import {integer} from '../../sqlite/SqliteColumns.ts'
import {builder, emit} from '../../test/TestUtils.ts'
import {sql} from '../Sql.ts'
import {table} from '../Table.ts'

const definition = {
  id: integer().primaryKey(),
  withDefault: integer().default(2),
  required: integer().notNull(),
  nullable: integer()
}

const Node = table('Node', definition)

test('update', () => {
  const query = builder.update(Node).set({
    nullable: null,
    required: 3,
    withDefault: sql<number>`${Node.required} + 1`
  })
  expect(emit(query)).toBe(
    'update "Node" set "nullable" = null, "required" = 3, "withDefault" = "required" + 1'
  )
})
