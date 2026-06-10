import type {Database} from '@/index.ts'
import type {DefineTest} from '@alinea/suite'
import {testBasic} from './integration/TestBasic.ts'
import {testBatch} from './integration/TestBatch.ts'
import {testCTE} from './integration/TestCTE.ts'
import {testColumns} from './integration/TestColumns.ts'
import {testConflicts} from './integration/TestConflicts.ts'
import {testConstraints} from './integration/TestConstraints.ts'
import {testEnums} from './integration/TestEnums.ts'
import {testInclude} from './integration/TestInclude.ts'
import {testJoins} from './integration/TestJoins.ts'
import {testJson} from './integration/TestJson.ts'
import {testMigration} from './integration/TestMigration.ts'
import {testPreparedQuery} from './integration/TestPreparedQuery.ts'
import {testSubquery} from './integration/TestSubquery.ts'
import {testTransactions} from './integration/TestTransactions.ts'
import {testUpdate} from './integration/TestUpdate.ts'
import {testViews} from './integration/TestViews.ts'

export async function testDriver(
  test: DefineTest<any>,
  createDb: () => Promise<Database | undefined>
) {
  const db = await createDb()
  if (!db) return
  const closeDb = () => {
    test('close database', async () => {
      await Promise.resolve(db.driver.close())
    })
  }
  if (db.dialect.runtime === 'postgres') testEnums(db, test)
  testBasic(db, test)
  testBatch(db, test)
  testColumns(db, test)
  testSubquery(db, test)
  testPreparedQuery(db, test)
  testJoins(db, test)
  testJson(db, test)
  testConstraints(db, test)
  testCTE(db, test)
  testInclude(db, test)
  testConflicts(db, test)
  testUpdate(db, test)
  testViews(db, test)
  if (!db.driver.supportsTransactions) {
    closeDb()
    return
  }
  testTransactions(db, test)
  testMigration(db, test)
  closeDb()
}
