import {eq, table} from '@/index.ts'
import {QueryBuilder} from '@/postgres/builder.ts'
import {integer} from '@/sqlite/columns.ts'
import {suite} from '@benmerckx/suite'
import {emit} from '../TestUtils.ts'

suite(import.meta, test => {
  const Node = table('Node', {
    id: integer().primaryKey()
  })

  test('delete from', () => {
    const query = new QueryBuilder()
      .delete(Node)
      .where(eq(Node.id, 1))
      .returning(Node.id)
    test.equal(
      emit(query),
      'delete from "Node" where "Node"."id" = 1 returning "Node"."id"'
    )
  })
})
