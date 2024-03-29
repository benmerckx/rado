import {expect, test} from 'bun:test'
import {integer} from '../../sqlite/SqliteColumns.ts'
import {eq} from '../Expr.ts'
import {sql} from '../Sql.ts'
import {table} from '../Table.ts'
import {delete as remove} from './Delete.ts'

const Node = table('Node', {
  id: integer().primaryKey()
})

test('delete from', () => {
  const query = remove(Node).where(eq(Node.id, 1)).returning(Node.id)
  expect(sql.test(query)).toBe(
    'delete from "Node" where "Node"."id" = 1 returning "Node"."id"'
  )
})
