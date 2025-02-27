import type {Database} from '@/index.ts'
import type {DefineTest} from '@alinea/suite'
import {testBasic} from './integration/TestBasic.ts'
import {testBatch} from './integration/TestBatch.ts'
import {testCTE} from './integration/TestCTE.ts'
import {testColumns} from './integration/TestColumns.ts'
import {testConflicts} from './integration/TestConflicts.ts'
import {testConstraints} from './integration/TestConstraints.ts'
import {testInclude} from './integration/TestInclude.ts'
import {testJoins} from './integration/TestJoins.ts'
import {testJson} from './integration/TestJson.ts'
import {testMigration} from './integration/TestMigration.ts'
import {testPreparedQuery} from './integration/TestPreparedQuery.ts'
import {testSubquery} from './integration/TestSubquery.ts'
import {testTransactions} from './integration/TestTransactions.ts'
import {testUpdate} from './integration/TestUpdate.ts'

export async function testDriver(
  test: DefineTest<any>,
  createDb: () => Promise<Database | undefined>
) {
  const db = await createDb()
  if (!db) return
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
  if (!db.driver.supportsTransactions) return
  testTransactions(db, test)
  testMigration(db, test)
}
