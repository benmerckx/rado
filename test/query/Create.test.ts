import {Assert, Test} from '@sinclair/carbon'
import {schema} from '../../src/core/Schema.ts'
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

  const testSchema = schema('test')
  const testNode = testSchema.table('Node', {
    id: integer().primaryKey()
  })

  Test.it('create table with schema', () => {
    const query = builder.create(testNode)
    Assert.isEqual(
      emit(query),
      'create table "test"."Node" ("id" integer primary key)'
    )
  })
})
