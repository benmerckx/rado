import {Assert, Test} from '@sinclair/carbon'
import {table} from '../../src/core/Table.ts'
import {integer} from '../../src/sqlite/SqliteColumns.ts'
import {builder, emit} from '../TestUtils.ts'

Test.describe('Create', () => {
  const Node = table('Node', {
    id: integer().primaryKey()
  })

  Test.it('create table', () => {
    const query = builder.create(Node)
    Assert.isEqual(
      emit(query),
      'create table "Node" ("id" integer primary key)'
    )
  })

  Test.it('if not exists', () => {
    const query = builder.create(Node).ifNotExists()
    Assert.isEqual(
      emit(query),
      'create table if not exists "Node" ("id" integer primary key)'
    )
  })
})
