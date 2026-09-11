import type {DefineTest} from '@alinea/suite'
import type {Database} from '#/index.ts'
import {testBasic} from './integration/TestBasic.ts'
import {testBatch} from './integration/TestBatch.ts'
import {testColumns} from './integration/TestColumns.ts'
import {testConflicts} from './integration/TestConflicts.ts'
import {testConstraints} from './integration/TestConstraints.ts'
import {testCTE} from './integration/TestCTE.ts'
import {testDirectQuery} from './integration/TestDirectQuery.ts'
import {testEnums} from './integration/TestEnums.ts'
import {testInclude} from './integration/TestInclude.ts'
import {testJoins} from './integration/TestJoins.ts'
import {testJson} from './integration/TestJson.ts'
import {testMigration} from './integration/TestMigration.ts'
import {testMutationResult} from './integration/TestMutationResult.ts'
import {testPreparedQuery} from './integration/TestPreparedQuery.ts'
import {testSubquery} from './integration/TestSubquery.ts'
import {testTransactions} from './integration/TestTransactions.ts'
import {testUpdate} from './integration/TestUpdate.ts'
import {testViews} from './integration/TestViews.ts'
import {testORM} from './orm/TestORM.ts'

export function testDriver(db: Database, test: DefineTest<any>, label: string) {
  const prefixed = Object.assign(
    (name: string, ...args: Array<any>) =>
      (test as any)(`${label}: ${name}`, ...args),
    test
  ) as DefineTest<any>
  const closeDb = (cleanup: () => Promise<void>) => {
    prefixed('close database', async () => {
      await cleanup()
      await Promise.resolve(db.driver.close())
    })
  }
  if (db.dialect.runtime === 'postgres') testEnums(db, prefixed)
  testBasic(db, prefixed)
  testBatch(db, prefixed)
  testColumns(db, prefixed)
  testDirectQuery(db, prefixed)
  testSubquery(db, prefixed)
  testMutationResult(db, prefixed)
  testPreparedQuery(db, prefixed)
  testJoins(db, prefixed)
  testJson(db, prefixed)
  testConstraints(db, prefixed)
  testCTE(db, prefixed)
  testInclude(db, prefixed)
  testConflicts(db, prefixed)
  testUpdate(db, prefixed)
  testViews(db, prefixed)
  const cleanupORM = testORM(db, prefixed)
  if (db.driver.supportsTransactions) {
    testTransactions(db, prefixed)
    testMigration(db, prefixed)
  }
  closeDb(cleanupORM)
}
