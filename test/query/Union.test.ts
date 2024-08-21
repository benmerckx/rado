import type {IsPostgres} from '@/core/MetaData.ts'
import {
  type Builder,
  except,
  exceptAll,
  intersect,
  intersectAll,
  lt,
  sql,
  table,
  union,
  unionAll
} from '@/index.ts'
import {integer} from '@/sqlite/columns.ts'
import {suite} from '@benmerckx/suite'
import {builder, emit} from '../TestUtils.ts'

const pg = builder as Builder<IsPostgres>

suite(import.meta, test => {
  const Node = table('Node', {
    id: integer().primaryKey()
  })

  const a = pg.select().from(Node)
  const b = pg.select().from(Node)

  test('a union b', () => {
    const query = a.union(b)
    test.equal(
      emit(query),
      'select "Node"."id" from "Node" union select "Node"."id" from "Node"'
    )
    const qInline = union(a, b)
    test.equal(emit(qInline), emit(query))
  })

  test('a union b union c', () => {
    const query = a.union(b).union(b)
    test.equal(
      emit(query),
      'select "Node"."id" from "Node" union select "Node"."id" from "Node" union select "Node"."id" from "Node"'
    )
    const qInline = union(a, b, b)
    test.equal(emit(qInline), emit(query))
  })

  test('a union all b', () => {
    const query = a.unionAll(b)
    test.equal(
      emit(query),
      'select "Node"."id" from "Node" union all select "Node"."id" from "Node"'
    )
    const qInline = unionAll(a, b)
    test.equal(emit(qInline), emit(query))
  })

  test('a intersect b', () => {
    const query = a.intersect(b)
    test.equal(
      emit(query),
      'select "Node"."id" from "Node" intersect select "Node"."id" from "Node"'
    )
    const qInline = intersect(a, b)
    test.equal(emit(qInline), emit(query))
  })

  test('a intersect all b', () => {
    const query = a.intersectAll(b)
    test.equal(
      emit(query),
      'select "Node"."id" from "Node" intersect all select "Node"."id" from "Node"'
    )
    const qInline = intersectAll(a, b)
    test.equal(emit(qInline), emit(query))
  })

  test('a except b', () => {
    const query = a.except(b)
    test.equal(
      emit(query),
      'select "Node"."id" from "Node" except select "Node"."id" from "Node"'
    )
    const qInline = except(a, b)
    test.equal(emit(qInline), emit(query))
  })

  test('a except all b', () => {
    const query = a.exceptAll(b)
    test.equal(
      emit(query),
      'select "Node"."id" from "Node" except all select "Node"."id" from "Node"'
    )
    const qInline = exceptAll(a, b)
    test.equal(emit(qInline), emit(query))
  })

  test('recursive', () => {
    const def = pg
      .select({n: sql.value(1), next: sql.value(1)})
      .unionAll(self =>
        pg
          .select({
            n: self.next,
            next: sql<number>`${self.n} + ${self.next}`
          })
          .from(self)
          .where(lt(self.n, 500))
      )
    const fibonacci = pg.$with('fibonacci').as(def)
    const query = pg.withRecursive(fibonacci).select().from(fibonacci)
    test.equal(
      emit(query),
      'with recursive "fibonacci" as (select 1 as "n", 1 as "next" union all select "fibonacci"."next" as "n", "fibonacci"."n" + "fibonacci"."next" as "next" from "fibonacci" where "fibonacci"."n" < 500) select * from "fibonacci"'
    )
  })
})
