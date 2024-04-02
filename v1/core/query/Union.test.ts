import {expect, test} from 'bun:test'
import {integer} from '../../sqlite/SqliteColumns.ts'
import {builder, emit} from '../../test/TestUtils.ts'
import {table} from '../Table.ts'

const Node = table('Node', {
  id: integer().primaryKey()
})

const a = builder.select().from(Node)
const b = builder.select().from(Node)

test('a union b', () => {
  const query = a.union(b)
  expect(emit(query)).toBe(
    'select "Node"."id" from "Node" union select "Node"."id" from "Node"'
  )
})

test('a union b union c', () => {
  const query = a.union(b).union(b)
  expect(emit(query)).toBe(
    'select "Node"."id" from "Node" union select "Node"."id" from "Node" union select "Node"."id" from "Node"'
  )
})

test('a union all b', () => {
  const query = a.unionAll(b)
  expect(emit(query)).toBe(
    'select "Node"."id" from "Node" union all select "Node"."id" from "Node"'
  )
})

test('a intersect b', () => {
  const query = a.intersect(b)
  expect(emit(query)).toBe(
    'select "Node"."id" from "Node" intersect select "Node"."id" from "Node"'
  )
})

test('a except b', () => {
  const query = a.except(b)
  expect(emit(query)).toBe(
    'select "Node"."id" from "Node" except select "Node"."id" from "Node"'
  )
})
