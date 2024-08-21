import {alias, eq, table} from '@/index.ts'
import {integer, text} from '@/universal.ts'
import {suite} from '@benmerckx/suite'
import {builder, emit} from '../TestUtils.ts'

suite(import.meta, test => {
  const Node = table('Node', {
    id: integer().primaryKey(),
    field1: text()
  })

  test('select all available columns', () => {
    const query = builder.select().from(Node)
    test.equal(emit(query), 'select "Node"."id", "Node"."field1" from "Node"')
  })

  test('select distinct', () => {
    const query = builder.selectDistinct().from(Node)
    test.equal(
      emit(query),
      'select distinct "Node"."id", "Node"."field1" from "Node"'
    )
  })

  test('select single field', () => {
    const query = builder.select(Node.id).from(Node)
    test.equal(emit(query), 'select "Node"."id" from "Node"')
  })

  test('left join', () => {
    const right = alias(Node, 'right')
    const query = builder.select().from(Node).leftJoin(right, eq(right.id, 1))
    test.equal(
      emit(query),
      'select "Node"."id", "Node"."field1", "right"."id" as "id_", "right"."field1" as "field1_" from "Node" left join "Node" as "right" on "right"."id" = 1'
    )
  })

  test('full join', () => {
    const right = alias(Node, 'right')
    const query = builder.select().from(Node).fullJoin(right, eq(right.id, 1))
    test.equal(
      emit(query),
      'select "Node"."id", "Node"."field1", "right"."id" as "id_", "right"."field1" as "field1_" from "Node" full join "Node" as "right" on "right"."id" = 1'
    )
  })

  test('order by', () => {
    const query = builder.select().from(Node).orderBy(Node.id)
    test.equal(
      emit(query),
      'select "Node"."id", "Node"."field1" from "Node" order by "Node"."id"'
    )
  })

  test('group by', () => {
    const query = builder.select().from(Node).groupBy(Node.id)
    test.equal(
      emit(query),
      'select "Node"."id", "Node"."field1" from "Node" group by "Node"."id"'
    )
  })

  test('limit and offset', () => {
    const query = builder.select().from(Node).limit(10).offset(5)
    test.equal(
      emit(query),
      'select "Node"."id", "Node"."field1" from "Node" limit 10 offset 5'
    )
  })

  test('gather fields in an object', () => {
    const query = builder
      .select({result: {id: Node.id, field1: Node.field1}})
      .from(Node)
    test.equal(emit(query), 'select "Node"."id", "Node"."field1" from "Node"')
  })

  test('subquery', () => {
    const sub = builder.select(Node.id).from(Node).as('sub')
    const query = builder.select(sub).from(sub)
    test.equal(
      emit(query),
      'select "sub"."id" from (select "Node"."id" from "Node") as "sub"'
    )
  })

  test('with cte', () => {
    const cte = builder.$with('myCte').as(builder.select().from(Node))
    const cte2 = builder.$with('cte2').as(builder.select(Node.id).from(Node))
    const query = builder
      .with(cte, cte2)
      .select({
        nodeId: cte.id,
        cte2Id: cte2
      })
      .from(cte)
      .limit(10)
    test.equal(
      emit(query),
      'with "myCte" as (select "Node"."id", "Node"."field1" from "Node"), "cte2" as (select "Node"."id" from "Node") select "myCte"."id" as "nodeId", "cte2"."id" as "cte2Id" from "myCte" limit 10'
    )
  })
})
