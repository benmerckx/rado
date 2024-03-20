import {expect, test} from 'bun:test'
import {integer} from '../../sqlite/SqliteColumns.ts'
import {sql} from '../Sql.ts'
import {table} from '../Table.ts'
import {select} from './Select.ts'

const Node = table('Node', {
  id: integer().primaryKey()
})

const a = select().from(Node)
const b = select().from(Node)

test('a union b', () => {
  const query = a.union(b)
  expect(sql.inline(query)).toBe(
    'select "Node"."id" from "Node" union select "Node"."id" from "Node"'
  )
})

test('a union b union c', () => {
  const query = a.union(b).union(b)
  expect(sql.inline(query)).toBe(
    'select "Node"."id" from "Node" union select "Node"."id" from "Node" union select "Node"."id" from "Node"'
  )
})

test('a union all b', () => {
  const query = a.unionAll(b)
  expect(sql.inline(query)).toBe(
    'select "Node"."id" from "Node" union all select "Node"."id" from "Node"'
  )
})

test('a intersect b', () => {
  const query = a.intersect(b)
  expect(sql.inline(query)).toBe(
    'select "Node"."id" from "Node" intersect select "Node"."id" from "Node"'
  )
})

test('a except b', () => {
  const query = a.except(b)
  expect(sql.inline(query)).toBe(
    'select "Node"."id" from "Node" except select "Node"."id" from "Node"'
  )
})
