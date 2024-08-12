import {suite} from '@benmerckx/suite'
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
import {integer} from '../../src/sqlite/columns.ts'
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
    const loopCte = pg.$withRecursive('loopCte').as(
      pg
        .select()
        .from(Node)
        .unionAll(self => pg.select({id: self.id}).from(Node))
    )
    const query = pg.with(loopCte).select().from(loopCte)
    test.equal(
      emit(query),
      'with recursive "loopCte" as (select "Node"."id" from "Node" union all select "loopCte"."id" from "Node") select * from "loopCte"'
    )
  })
})
