import {expect, test} from 'bun:test'
import {sql} from '../Sql.ts'
import {table} from '../Table.ts'
import {integer} from '../sqlite/SqliteColumns.ts'
import {Create} from './Create.ts'

const Node = table('Node', {
  id: integer().primaryKey()
})

test('create table', () => {
  const query = new Create({table: Node})
  expect(sql.inline(query)).toBe(
    'create table "Node" ("id" integer primary key)'
  )
})

test('if not exists', () => {
  const query = new Create({table: Node}).ifNotExists()
  expect(sql.inline(query)).toBe(
    'create table if not exists "Node" ("id" integer primary key)'
  )
})
