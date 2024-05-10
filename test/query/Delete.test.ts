import {table} from '../../src/core/Table.ts'
import {eq} from '../../src/core/expr/Conditions.ts'
import {integer} from '../../src/sqlite/SqliteColumns.ts'
import {suite} from '../Suite.ts'
import {builder, emit} from '../TestUtils.ts'

suite(import.meta, ({test, isEqual}) => {
  const Node = table('Node', {
    id: integer().primaryKey()
  })

  test('delete from', () => {
    const query = builder.delete(Node).where(eq(Node.id, 1)).returning(Node.id)
    isEqual(
      emit(query),
      'delete from "Node" where "Node"."id" = 1 returning "Node"."id"'
    )
  })
})
