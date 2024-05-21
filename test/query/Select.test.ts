import {alias, table} from '../../src/core/Table.ts'
import {eq} from '../../src/core/expr/Conditions.ts'
import {int, text} from '../../src/universal.ts'
import {suite} from '../Suite.ts'
import {builder, emit} from '../TestUtils.ts'

suite(import.meta, ({test, isEqual}) => {
  const Node = table('Node', {
    id: int().primaryKey(),
    field1: text()
  })

  test('select all available columns', () => {
    const query = builder.select().from(Node)
    isEqual(emit(query), 'select "Node"."id", "Node"."field1" from "Node"')
  })

  test('select distinct', () => {
    const query = builder.selectDistinct().from(Node)
    isEqual(
      emit(query),
      'select distinct "Node"."id", "Node"."field1" from "Node"'
    )
  })

  test('select single field', () => {
    const query = builder.select(Node.id).from(Node)
    isEqual(emit(query), 'select "Node"."id" from "Node"')
  })

  test('left join', () => {
    const right = alias(Node, 'right')
    const query = builder.select().from(Node).leftJoin(right, eq(right.id, 1))
    isEqual(
      emit(query),
      'select "Node"."id", "Node"."field1", "right"."id" as "id_", "right"."field1" as "field1_" from "Node" left join "Node" as "right" on "right"."id" = 1'
    )
  })

  test('full join', () => {
    const right = alias(Node, 'right')
    const query = builder.select().from(Node).fullJoin(right, eq(right.id, 1))
    isEqual(
      emit(query),
      'select "Node"."id", "Node"."field1", "right"."id" as "id_", "right"."field1" as "field1_" from "Node" full join "Node" as "right" on "right"."id" = 1'
    )
  })

  test('order by', () => {
    const query = builder.select().from(Node).orderBy(Node.id)
    isEqual(
      emit(query),
      'select "Node"."id", "Node"."field1" from "Node" order by "Node"."id"'
    )
  })

  test('group by', () => {
    const query = builder.select().from(Node).groupBy(Node.id)
    isEqual(
      emit(query),
      'select "Node"."id", "Node"."field1" from "Node" group by "Node"."id"'
    )
  })

  test('limit and offset', () => {
    const query = builder.select().from(Node).limit(10).offset(5)
    isEqual(
      emit(query),
      'select "Node"."id", "Node"."field1" from "Node" limit 10 offset 5'
    )
  })

  test('gather fields in an object', () => {
    const query = builder
      .select({result: {id: Node.id, field1: Node.field1}})
      .from(Node)
    isEqual(emit(query), 'select "Node"."id", "Node"."field1" from "Node"')
  })

  test('subquery', () => {
    const sub = builder.select(Node.id).from(Node).as('sub')
    const query = builder.select(sub).from(sub)
    isEqual(
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
    isEqual(
      emit(query),
      'with "myCte" as (select "Node"."id", "Node"."field1" from "Node"), "cte2" as (select "Node"."id" from "Node") select "myCte"."id" as "nodeId", "cte2"."id" as "cte2Id" from "myCte" limit 10'
    )
  })
})
