import {basename} from 'node:path'
import {fileURLToPath} from 'node:url'
import {suite, type DefineTest} from '@alinea/suite'
import type {Database} from '#/index.ts'
import {testBasic} from './integration/TestBasic.ts'
import {testBatch} from './integration/TestBatch.ts'
import {testColumns} from './integration/TestColumns.ts'
import {testConflicts} from './integration/TestConflicts.ts'
import {testConstraints} from './integration/TestConstraints.ts'
import {testCTE} from './integration/TestCTE.ts'
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
  meta: ImportMeta,
  createDb: () => Promise<Database | undefined>
) {
  const db = await createDb()
  if (!db) return
  const name = basename(fileURLToPath(meta.url), '.test.ts')
  const test = suite(meta)
  const driverTest = Object.assign(
    ((description: string, ...args: Array<any>) =>
      (test as any)(`${name}: ${description}`, ...args)) as DefineTest,
    test
  )
  const closeDb = () => {
    driverTest('close database', async () => {
      await Promise.resolve(db.driver.close())
    })
  }
  if (db.dialect.runtime === 'postgres') testEnums(db, driverTest)
  testBasic(db, driverTest)
  testBatch(db, driverTest)
  testColumns(db, driverTest)
  testSubquery(db, driverTest)
  testPreparedQuery(db, driverTest)
  testJoins(db, driverTest)
  testJson(db, driverTest)
  testConstraints(db, driverTest)
  testCTE(db, driverTest)
  testInclude(db, driverTest)
  testConflicts(db, driverTest)
  testUpdate(db, driverTest)
  testViews(db, driverTest)
  if (db.driver.supportsTransactions) {
    testTransactions(db, driverTest)
    testMigration(db, driverTest)
  }
  closeDb()
}
