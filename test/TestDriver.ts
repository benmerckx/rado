import {suite, type DefineTest} from '@benmerckx/suite'
import type {Database} from '../src/core/Database.ts'
import {table} from '../src/core/Table.ts'
import {foreignKey, primaryKey, unique} from '../src/index.ts'
import {boolean, id, integer, text} from '../src/universal.ts'

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
  suite(meta, async test => {
    const testModule = (
      module: Promise<
        Record<string, (db: Database, test: DefineTest) => Promise<void>>
      >
    ) =>
      module.then(exports => {
        for (const key in exports) {
          test(key, exports[key].bind(null, db, test))
        }
      })
    testModule(import('./integration/TestBasic.ts'))
    testModule(import('./integration/TestSubquery.ts'))
    testModule(import('./integration/TestPreparedQuery.ts'))
    testModule(import('./integration/TestJoins.ts'))
    testModule(import('./integration/TestJson.ts'))
    testModule(import('./integration/TestTransactions.ts'))
    testModule(import('./integration/TestTransactions.ts'))
    testModule(import('./integration/TestConstraints.ts'))
    testModule(import('./integration/TestCTE.ts'))
    testModule(import('./integration/TestInclude.ts'))

    if (supportsDiff) testModule(import('./integration/TestMigration.ts'))
  })
}
