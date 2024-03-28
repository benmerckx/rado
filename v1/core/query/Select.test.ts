import {expect, test} from 'bun:test'
import {integer, text} from '../../sqlite/SqliteColumns.ts'
import {eq} from '../Expr.ts'
import {sql} from '../Sql.ts'
import {alias, table} from '../Table.ts'
import {select, selectDistinct} from './Select.ts'

const Node = table('Node', {
  id: integer().primaryKey(),
  field1: text()
})
const x = alias(Node, 'x')
const y = alias(Node, 'y')
test('select all available columns', () => {
  const query = select().from(Node)
  expect(sql.inline(query)).toBe(
    'select "Node"."id", "Node"."field1" from "Node"'
  )
})

test('select distinct', () => {
  const query = selectDistinct().from(Node)
  expect(sql.inline(query)).toBe(
    'select distinct "Node"."id", "Node"."field1" from "Node"'
  )
})

test('select single field', () => {
  const query = select(Node.id).from(Node)
  expect(sql.inline(query)).toBe('select "Node"."id" from "Node"')
})

test('left join', () => {
  const query = select().from(Node).leftJoin(Node, eq(Node.id, 1))
  expect(sql.inline(query)).toBe(
    'select "Node"."id", "Node"."field1" from "Node" left join "Node" on "Node"."id" = 1'
  )
})

test('order by', () => {
  const query = select().from(Node).orderBy(Node.id)
  expect(sql.inline(query)).toBe(
    'select "Node"."id", "Node"."field1" from "Node" order by "Node"."id"'
  )
})

test('limit and offset', () => {
  const query = select().from(Node).limit(10).offset(5)
  expect(sql.inline(query)).toBe(
    'select "Node"."id", "Node"."field1" from "Node" limit 10 offset 5'
  )
})

test('gather fields in an object', () => {
  const query = select({
    result: {id: Node.id, field1: Node.field1}
  }).from(Node)
  expect(sql.inline(query)).toBe(
    'select "Node"."id", "Node"."field1" from "Node"'
  )
})
