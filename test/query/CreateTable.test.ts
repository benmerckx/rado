import {foreignKey, primaryKey, unique} from '../../src/core/Constraint.ts'
import {schema} from '../../src/core/Schema.ts'
import {table} from '../../src/core/Table.ts'
import {integer} from '../../src/sqlite/SqliteColumns.ts'
import {suite} from '../Suite.ts'
import {builder, emit} from '../TestUtils.ts'

suite(import.meta, ({test, isEqual}) => {
  const Node = table('Node', {
    id: integer().primaryKey()
  })

  test('create table', () => {
    const query = builder.createTable(Node)
    isEqual(emit(query), 'create table "Node" ("id" integer primary key)')
  })

  test('if not exists', () => {
    const query = builder.createTable(Node).ifNotExists()
    isEqual(
      emit(query),
      'create table if not exists "Node" ("id" integer primary key)'
    )
  })

  const testSchema = schema('test')
  const testNode = testSchema.table('Node', {
    id: integer().primaryKey()
  })

  test('create table with schema', () => {
    const query = builder.createTable(testNode)
    isEqual(
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

  test('create table with constraints', () => {
    const query = builder.createTable(withConstraints)
    isEqual(
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
