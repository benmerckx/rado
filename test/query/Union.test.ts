import {Assert, Test} from '@sinclair/carbon'
import {table} from '../../src/core/Table.ts'
import {integer} from '../../src/sqlite/SqliteColumns.ts'
import {builder, emit} from '../TestUtils.ts'

Test.describe('Union', () => {
  const Node = table('Node', {
    id: integer().primaryKey()
  })

  const a = builder.select().from(Node)
  const b = builder.select().from(Node)

  Test.it('a union b', () => {
    const query = a.union(b)
    Assert.isEqual(
      emit(query),
      'select "Node"."id" from "Node" union select "Node"."id" from "Node"'
    )
  })

  Test.it('a union b union c', () => {
    const query = a.union(b).union(b)
    Assert.isEqual(
      emit(query),
      'select "Node"."id" from "Node" union select "Node"."id" from "Node" union select "Node"."id" from "Node"'
    )
  })

  Test.it('a union all b', () => {
    const query = a.unionAll(b)
    Assert.isEqual(
      emit(query),
      'select "Node"."id" from "Node" union all select "Node"."id" from "Node"'
    )
  })

  Test.it('a intersect b', () => {
    const query = a.intersect(b)
    Assert.isEqual(
      emit(query),
      'select "Node"."id" from "Node" intersect select "Node"."id" from "Node"'
    )
  })

  Test.it('a except b', () => {
    const query = a.except(b)
    Assert.isEqual(
      emit(query),
      'select "Node"."id" from "Node" except select "Node"."id" from "Node"'
    )
  })
})
