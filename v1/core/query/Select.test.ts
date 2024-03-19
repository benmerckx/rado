import {expect, test} from 'bun:test'
import {integer, text} from '../../sqlite/SqliteColumns.ts'
import {eq} from '../Expr.ts'
import {sql} from '../Sql.ts'
import {table} from '../Table.ts'
import {Select} from './Select.ts'

const Node = table('Node', {
  id: integer().primaryKey(),
  field1: text()
})

test('select all available columns', () => {
  const query = new Select({}).from(Node)
  expect(sql.inline(query)).toBe(
    'select "Node"."id", "Node"."field1" from "Node"'
  )
})

test('select distinct', () => {
  const query = new Select({distinct: true}).from(Node)
  expect(sql.inline(query)).toBe(
    'select distinct "Node"."id", "Node"."field1" from "Node"'
  )
})

test('select single field', () => {
  const query = new Select({}).select(Node.id).from(Node)
  expect(sql.inline(query)).toBe('select "Node"."id" from "Node"')
})

test('left join', () => {
  const query = new Select({}).from(Node).leftJoin(Node, eq(Node.id, 1))
  expect(sql.inline(query)).toBe(
    'select "Node"."id", "Node"."field1" from "Node" left join "Node" on "Node"."id" = 1'
  )
})
