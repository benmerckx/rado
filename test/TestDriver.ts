import {type DefineTest, suite} from '@benmerckx/suite'
import type {Database} from '../src/core/Database.ts'
import {table} from '../src/core/Table.ts'
import {foreignKey, primaryKey, unique} from '../src/index.ts'
import {boolean, id, integer, text} from '../src/universal.ts'
import {testBasic} from './integration/TestBasic.ts'
import {testCTE} from './integration/TestCTE.ts'
import {testConstraints} from './integration/TestConstraints.ts'
import {testInclude} from './integration/TestInclude.ts'
import {testJoins} from './integration/TestJoins.ts'
import {testJson} from './integration/TestJson.ts'
import {testMigration} from './integration/TestMigration.ts'
import {testPreparedQuery} from './integration/TestPreparedQuery.ts'
import {testSubquery} from './integration/TestSubquery.ts'
import {
  testGeneratorTransactions,
  testTransactions
} from './integration/TestTransactions.ts'

const Node = table('Node', {
  id: id().notNull(),
  textField: text().notNull(),
  bool: boolean()
})

const User = table('User', {
  id: id(),
  name: text().notNull()
})

const Post = table('Post', {
  id: id(),
  userId: integer().notNull(),
  title: text().notNull()
})

const TableA = table('TableA', {
  id: id()
})

const TableB = table(
  'TableB',
  {
    isUnique: integer().unique(),
    hasRef: integer().references(TableA.id),
    colA: integer(),
    colB: integer().unique()
  },
  TableB => {
    return {
      uniqueA: unique().on(TableB.colA),
      multiPk: primaryKey(TableB.colA, TableB.colB),
      multiRef: foreignKey(TableB.colA).references(TableA.id)
    }
  }
)

export async function testDriver(
  meta: ImportMeta,
  createDb: () => Promise<Database>,
  supportsDiff = true
) {
  const db = await createDb()
  suite(meta, test => {
    const bind = (fn: (db: Database, test: DefineTest) => void) =>
      fn.bind(null, db, test)

    test('basics', bind(testBasic))
    test('subquery', bind(testSubquery))
    test('prepared queries', bind(testPreparedQuery))
    test('joins', bind(testJoins))
    test('json fields', bind(testJson))
    test('transactions', bind(testTransactions))
    test('generator transactions', bind(testGeneratorTransactions))
    test('constraints and indexes', bind(testConstraints))
    test('recursive cte', bind(testCTE))
    test('include', bind(testInclude))

    if (supportsDiff) test('migrate', bind(testMigration))
  })
}
