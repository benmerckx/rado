import {table} from '../../src/core/Table.ts'
import {integer} from '../../src/sqlite/SqliteColumns.ts'
import {suite} from '../Suite.ts'
import {builder, emit} from '../TestUtils.ts'

suite(import.meta, ({test, isEqual}) => {
  const Node = table('Node', {
    id: integer().primaryKey()
  })

  const a = builder.select().from(Node)
  const b = builder.select().from(Node)

  test('a union b', () => {
    const query = a.union(b)
    isEqual(
      emit(query),
      'select "Node"."id" from "Node" union select "Node"."id" from "Node"'
    )
  })

  test('a union b union c', () => {
    const query = a.union(b).union(b)
    isEqual(
      emit(query),
      'select "Node"."id" from "Node" union select "Node"."id" from "Node" union select "Node"."id" from "Node"'
    )
  })

  test('a union all b', () => {
    const query = a.unionAll(b)
    isEqual(
      emit(query),
      'select "Node"."id" from "Node" union all select "Node"."id" from "Node"'
    )
  })

  test('a intersect b', () => {
    const query = a.intersect(b)
    isEqual(
      emit(query),
      'select "Node"."id" from "Node" intersect select "Node"."id" from "Node"'
    )
  })

  test('a except b', () => {
    const query = a.except(b)
    isEqual(
      emit(query),
      'select "Node"."id" from "Node" except select "Node"."id" from "Node"'
    )
  })
})
