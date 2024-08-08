import {suite} from '@benmerckx/suite'
import {table} from '../../src/core/Table.ts'
import {eq} from '../../src/core/expr/Conditions.ts'
import {integer} from '../../src/sqlite/columns.ts'
import {builder, emit} from '../TestUtils.ts'

suite(import.meta, test => {
  const Node = table('Node', {
    id: integer().primaryKey()
  })

  test('delete from', () => {
    const query = builder.delete(Node).where(eq(Node.id, 1)).returning(Node.id)
    test.equal(
      emit(query),
      'delete from "Node" where "Node"."id" = 1 returning "Node"."id"'
    )
  })
})
