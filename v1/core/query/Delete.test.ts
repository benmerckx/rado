import {expect, test} from 'bun:test'
import {integer} from '../../sqlite/SqliteColumns.ts'
import {builder, emit} from '../../test/TestUtils.ts'
import {eq} from '../Expr.ts'
import {table} from '../Table.ts'

const Node = table('Node', {
  id: integer().primaryKey()
})

test('delete from', () => {
  const query = builder.delete(Node).where(eq(Node.id, 1)).returning(Node.id)
  expect(emit(query)).toBe(
    'delete from "Node" where "Node"."id" = 1 returning "Node"."id"'
  )
})
