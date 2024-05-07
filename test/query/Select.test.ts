import {Assert, Test} from '@sinclair/carbon'
import {alias, table} from '../../src/core/Table.ts'
import {eq} from '../../src/core/expr/Conditions.ts'
import {integer, text} from '../../src/sqlite/SqliteColumns.ts'
import {builder, emit} from '../TestUtils.ts'

Test.describe('Select', () => {
  const Node = table('Node', {
    id: integer().primaryKey(),
    field1: text()
  })

  Test.it('select all available columns', () => {
    const query = builder.select().from(Node)
    Assert.isEqual(
      emit(query),
      'select "Node"."id", "Node"."field1" from "Node"'
    )
  })

  Test.it('select distinct', () => {
    const query = builder.selectDistinct().from(Node)
    Assert.isEqual(
      emit(query),
      'select distinct "Node"."id", "Node"."field1" from "Node"'
    )
  })

  Test.it('select single field', () => {
    const query = builder.select(Node.id).from(Node)
    Assert.isEqual(emit(query), 'select "Node"."id" from "Node"')
  })

  Test.it('left join', () => {
    const right = alias(Node, 'right')
    const query = builder.select().from(Node).leftJoin(right, eq(right.id, 1))
    Assert.isEqual(
      emit(query),
      'select "Node"."id", "Node"."field1", "right"."id" as "id_", "right"."field1" as "field1_" from "Node" left join "Node" as "right" on "right"."id" = 1'
    )
  })

  Test.it('order by', () => {
    const query = builder.select().from(Node).orderBy(Node.id)
    Assert.isEqual(
      emit(query),
      'select "Node"."id", "Node"."field1" from "Node" order by "Node"."id"'
    )
  })

  Test.it('limit and offset', () => {
    const query = builder.select().from(Node).limit(10).offset(5)
    Assert.isEqual(
      emit(query),
      'select "Node"."id", "Node"."field1" from "Node" limit 10 offset 5'
    )
  })

  Test.it('gather fields in an object', () => {
    const query = builder
      .select({result: {id: Node.id, field1: Node.field1}})
      .from(Node)
    Assert.isEqual(
      emit(query),
      'select "Node"."id", "Node"."field1" from "Node"'
    )
  })

  Test.it('subquery', () => {
    const sub = builder.select(Node.id).from(Node).as('sub')
    const query = builder.select(sub).from(sub)
    Assert.isEqual(
      emit(query),
      'select "sub"."id" from (select "Node"."id" from "Node") as "sub"'
    )
  })

  Test.it('with cte', () => {
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
    Assert.isEqual(
      emit(query),
      'with "myCte" as (select "Node"."id", "Node"."field1" from "Node"), "cte2" as (select "Node"."id" from "Node") select "myCte"."id" as "nodeId", "cte2"."id" as "cte2Id" from "myCte" limit 10'
    )
  })
})
