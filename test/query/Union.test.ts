import type {Builder} from '../../src/core/Builder.ts'
import type {IsPostgres} from '../../src/core/MetaData.ts'
import {table} from '../../src/core/Table.ts'
import {
  except,
  exceptAll,
  intersect,
  intersectAll,
  union,
  unionAll
} from '../../src/index.ts'
import {integer} from '../../src/sqlite/SqliteColumns.ts'
import {suite} from '../Suite.ts'
import {builder, emit} from '../TestUtils.ts'

const pg = builder as Builder<IsPostgres>

suite(import.meta, ({test, isEqual}) => {
  const Node = table('Node', {
    id: integer().primaryKey()
  })

  const a = pg.select().from(Node)
  const b = pg.select().from(Node)

  test('a union b', () => {
    const query = a.union(b)
    isEqual(
      emit(query),
      'select "Node"."id" from "Node" union select "Node"."id" from "Node"'
    )
    const qInline = union(a, b)
    isEqual(emit(qInline), emit(query))
  })

  test('a union b union c', () => {
    const query = a.union(b).union(b)
    isEqual(
      emit(query),
      'select "Node"."id" from "Node" union select "Node"."id" from "Node" union select "Node"."id" from "Node"'
    )
    const qInline = union(a, b, b)
    isEqual(emit(qInline), emit(query))
  })

  test('a union all b', () => {
    const query = a.unionAll(b)
    isEqual(
      emit(query),
      'select "Node"."id" from "Node" union all select "Node"."id" from "Node"'
    )
    const qInline = unionAll(a, b)
    isEqual(emit(qInline), emit(query))
  })

  test('a intersect b', () => {
    const query = a.intersect(b)
    isEqual(
      emit(query),
      'select "Node"."id" from "Node" intersect select "Node"."id" from "Node"'
    )
    const qInline = intersect(a, b)
    isEqual(emit(qInline), emit(query))
  })

  test('a intersect all b', () => {
    const query = a.intersectAll(b)
    isEqual(
      emit(query),
      'select "Node"."id" from "Node" intersect all select "Node"."id" from "Node"'
    )
    const qInline = intersectAll(a, b)
    isEqual(emit(qInline), emit(query))
  })

  test('a except b', () => {
    const query = a.except(b)
    isEqual(
      emit(query),
      'select "Node"."id" from "Node" except select "Node"."id" from "Node"'
    )
    const qInline = except(a, b)
    isEqual(emit(qInline), emit(query))
  })

  test('a except all b', () => {
    const query = a.exceptAll(b)
    isEqual(
      emit(query),
      'select "Node"."id" from "Node" except all select "Node"."id" from "Node"'
    )
    const qInline = exceptAll(a, b)
    isEqual(emit(qInline), emit(query))
  })
})
