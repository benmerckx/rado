import {expect, test} from 'bun:test'
import {integer} from '../../sqlite/SqliteColumns.ts'
import {builder, emit} from '../../test/TestUtils.ts'
import {table} from '../Table.ts'

const Node = table('Node', {
  id: integer().primaryKey()
})

test('create table', () => {
  const query = builder.create(Node)
  expect(emit(query)).toBe('create table "Node" ("id" integer primary key)')
})

test('if not exists', () => {
  const query = builder.create(Node).ifNotExists()
  expect(emit(query)).toBe(
    'create table if not exists "Node" ("id" integer primary key)'
  )
})
