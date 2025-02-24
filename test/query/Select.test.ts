import {alias, eq, table} from '@/index.ts'
import {integer, text} from '@/universal.ts'
import {suite} from '@alinea/suite'
import {builder, emit} from '../TestUtils.ts'

suite(import.meta, test => {
  const Node = table('Node', {
    id: integer().primaryKey(),
    field1: text()
  })

  test('select all available columns', () => {
    const expected = 'select "Node"."id", "Node"."field1" from "Node"'
    const query = builder.select().from(Node)
    test.equal(emit(query), expected)
    const direct = builder.$query({from: Node})
    test.equal(emit(direct), expected)
  })

  test('select distinct', () => {
    const expected = 'select distinct "Node"."id", "Node"."field1" from "Node"'
    const query = builder.selectDistinct().from(Node)
    test.equal(emit(query), expected)
    const direct = builder.$query({from: Node, distinct: true})
    test.equal(emit(direct), expected)
  })

  test('select single field', () => {
    const expected = 'select "Node"."id" from "Node"'
    const query = builder.select(Node.id).from(Node)
    test.equal(emit(query), expected)
    const direct = builder.$query({from: Node, select: Node.id})
    test.equal(emit(direct), expected)
  })

  test('left join', () => {
    const expected =
      'select "Node"."id", "Node"."field1", "right"."id" as "id_", "right"."field1" as "field1_" from "Node" left join "Node" as "right" on "right"."id" = 1'
    const right = alias(Node, 'right')
    const query = builder.select().from(Node).leftJoin(right, eq(right.id, 1))
    test.equal(emit(query), expected)
    const direct = builder.$query({
      from: [Node, {leftJoin: right, on: eq(right.id, 1)}]
    })
    test.equal(emit(direct), expected)
  })

  test('full join', () => {
    const expected =
      'select "Node"."id", "Node"."field1", "right"."id" as "id_", "right"."field1" as "field1_" from "Node" full join "Node" as "right" on "right"."id" = 1'
    const right = alias(Node, 'right')
    const query = builder.select().from(Node).fullJoin(right, eq(right.id, 1))
    test.equal(emit(query), expected)
    const direct = builder.$query({
      from: [Node, {fullJoin: right, on: eq(right.id, 1)}]
    })
    test.equal(emit(direct), expected)
  })

  test('order by', () => {
    const expected =
      'select "Node"."id", "Node"."field1" from "Node" order by "id"'
    const query = builder.select().from(Node).orderBy(Node.id)
    test.equal(emit(query), expected)
    const direct = builder.$query({from: Node, orderBy: [Node.id]})
    test.equal(emit(direct), expected)
  })

  test('group by', () => {
    const expected =
      'select "Node"."id", "Node"."field1" from "Node" group by "Node"."id"'
    const query = builder.select().from(Node).groupBy(Node.id)
    test.equal(emit(query), expected)
    const direct = builder.$query({from: Node, groupBy: [Node.id]})
    test.equal(emit(direct), expected)
  })

  test('limit and offset', () => {
    const expected =
      'select "Node"."id", "Node"."field1" from "Node" limit 10 offset 5'
    const query = builder.select().from(Node).limit(10).offset(5)
    test.equal(emit(query), expected)
    const direct = builder.$query({from: Node, limit: 10, offset: 5})
    test.equal(emit(direct), expected)
  })

  test('gather fields in an object', () => {
    const expected = 'select "Node"."id", "Node"."field1" from "Node"'
    const query = builder
      .select({result: {id: Node.id, field1: Node.field1}})
      .from(Node)
    test.equal(emit(query), expected)
    const direct = builder.$query({
      from: Node,
      select: {result: {id: Node.id, field1: Node.field1}}
    })
    test.equal(emit(direct), expected)
  })

  test('subquery', () => {
    const expected =
      'select "sub"."id" from (select "Node"."id" from "Node") as "sub"'
    const sub = builder.select(Node.id).from(Node).as('sub')
    const query = builder.select(sub).from(sub)
    test.equal(emit(query), expected)
    const direct = builder.$query({from: sub, select: sub})
    test.equal(emit(direct), expected)
  })

  test('with cte', () => {
    const expected =
      'with "myCte" as (select "Node"."id", "Node"."field1" from "Node"), "cte2" as (select "Node"."id" from "Node") select "myCte"."id" as "nodeId", "cte2"."id" as "cte2Id" from "myCte" limit 10'
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
    test.equal(emit(query), expected)
    const direct = builder.$query({
      with: [cte, cte2],
      from: cte,
      select: {nodeId: cte.id, cte2Id: cte2},
      limit: 10
    })
    test.equal(emit(direct), expected)
  })
})
