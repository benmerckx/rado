import {expect, test} from 'bun:test'
import {integer, text} from '../../sqlite/SqliteColumns.ts'
import {builder, emit} from '../../test/TestUtils.ts'
import {eq} from '../Expr.ts'
import {alias, table} from '../Table.ts'

const Node = table('Node', {
  id: integer().primaryKey(),
  field1: text()
})

test('select all available columns', () => {
  const query = builder.select().from(Node)
  expect(emit(query)).toBe('select "Node"."id", "Node"."field1" from "Node"')
})

test('select distinct', () => {
  const query = builder.selectDistinct().from(Node)
  expect(emit(query)).toBe(
    'select distinct "Node"."id", "Node"."field1" from "Node"'
  )
})

test('select single field', () => {
  const query = builder.select(Node.id).from(Node)
  expect(emit(query)).toBe('select "Node"."id" from "Node"')
})

test('left join', () => {
  const right = alias(Node, 'right')
  const query = builder.select().from(Node).leftJoin(right, eq(right.id, 1))
  expect(emit(query)).toBe(
    'select "Node"."id", "Node"."field1", "right"."id", "right"."field1" from "Node" left join "Node" as "right" on "right"."id" = 1'
  )
})

test('order by', () => {
  const query = builder.select().from(Node).orderBy(Node.id)
  expect(emit(query)).toBe(
    'select "Node"."id", "Node"."field1" from "Node" order by "Node"."id"'
  )
})

test('limit and offset', () => {
  const query = builder.select().from(Node).limit(10).offset(5)
  expect(emit(query)).toBe(
    'select "Node"."id", "Node"."field1" from "Node" limit 10 offset 5'
  )
})

test('gather fields in an object', () => {
  const query = builder
    .select({result: {id: Node.id, field1: Node.field1}})
    .from(Node)
  expect(emit(query)).toBe('select "Node"."id", "Node"."field1" from "Node"')
})
