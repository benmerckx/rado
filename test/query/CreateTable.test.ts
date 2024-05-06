import {Assert, Test} from '@sinclair/carbon'
import {foreignKey, primaryKey, unique} from '../../src/core/Constraint.ts'
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
      isUnique: integer().unique(),
      hasRef: integer().references(Node.id),
      colA: integer(),
      colB: integer()
    },
    WithConstraints => {
      return {
        uniqueMe: unique().on(WithConstraints.name),
        multiPk: primaryKey(WithConstraints.colA, WithConstraints.colB),
        multiRef: foreignKey(WithConstraints.colA).references(
          WithConstraints.colB
        )
      }
    }
  )

  Test.it('create table with constraints', () => {
    const query = builder.createTable(withConstraints)
    Assert.isEqual(
      emit(query),
      'create table "WithConstraints"' +
        ' ("id" integer primary key,' +
        ' "name" integer not null,' +
        ' "isUnique" integer unique,' +
        ' "hasRef" integer references "Node" ("id"),' +
        ' "colA" integer,' +
        ' "colB" integer,' +
        ' constraint "uniqueMe" unique ("name"),' +
        ' constraint "multiPk" primary key ("colA", "colB"),' +
        ' constraint "multiRef" foreign key ("colA") references "WithConstraints" ("colB")' +
        ')'
    )
  })
})
