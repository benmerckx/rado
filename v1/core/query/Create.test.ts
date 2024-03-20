import {expect, test} from 'bun:test'
import {integer} from '../../sqlite/SqliteColumns.ts'
import {sql} from '../Sql.ts'
import {table} from '../Table.ts'
import {create} from './Create.ts'

const Node = table('Node', {
  id: integer().primaryKey()
})

test('create table', () => {
  const query = create(Node)
  expect(sql.inline(query)).toBe(
    'create table "Node" ("id" integer primary key)'
  )
})

test('if not exists', () => {
  const query = create(Node).ifNotExists()
  expect(sql.inline(query)).toBe(
    'create table if not exists "Node" ("id" integer primary key)'
  )
})
