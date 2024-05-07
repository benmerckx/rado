import {Assert, Test} from '@sinclair/carbon'
import {table} from '../../src/core/Table.ts'
import {eq} from '../../src/core/expr/Conditions.ts'
import {integer} from '../../src/sqlite/SqliteColumns.ts'
import {builder, emit} from '../TestUtils.ts'

Test.describe('Delete', () => {
  const Node = table('Node', {
    id: integer().primaryKey()
  })

  Test.it('delete from', () => {
    const query = builder.delete(Node).where(eq(Node.id, 1)).returning(Node.id)
    Assert.isEqual(
      emit(query),
      'delete from "Node" where "Node"."id" = 1 returning "Node"."id"'
    )
  })
})
