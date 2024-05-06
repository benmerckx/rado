import {Assert, Test} from '@sinclair/carbon'
import {unique} from '../../src/core/Constraint.ts'
import {index} from '../../src/core/Index.ts'
import {schema} from '../../src/core/Schema.ts'
import {table} from '../../src/core/Table.ts'
import {integer} from '../../src/sqlite/SqliteColumns.ts'
import {builder, emit} from '../TestUtils.ts'

Test.describe('Create', () => {
  const Node = table('Node', {
    id: integer().primaryKey()
  })

  Test.it('create table', () => {
    const query = builder.createTable(Node)
    Assert.isEqual(
      emit(query),
      'create table "Node" ("id" integer primary key)'
    )
  })

  Test.it('if not exists', () => {
    const query = builder.createTable(Node).ifNotExists()
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
    const query = builder.createTable(testNode)
    Assert.isEqual(
      emit(query),
      'create table "test"."Node" ("id" integer primary key)'
    )
  })

  const withConstraints = table(
    'WithConstraints',
    {
      id: integer().primaryKey(),
      name: integer().notNull(),
      ref: integer()
    },
    WithConstraints => {
      return {
        uniqueMe: unique().on(WithConstraints.name),
        indexRef: index().on(WithConstraints.ref)
      }
    }
  )

  Test.it('create table with constraints', () => {
    const query = builder.createTable(withConstraints)
    Assert.isEqual(
      emit(query),
      'create table "WithConstraints" ("id" integer primary key, "name" integer not null, "ref" integer, unique ("name"))'
    )
  })
})
