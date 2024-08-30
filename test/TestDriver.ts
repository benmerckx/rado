import {suite} from '@benmerckx/suite'
import type {Database} from '../src/core/Database.ts'
import {testBasic} from './integration/TestBasic.ts'
import {testCTE} from './integration/TestCTE.ts'
import {testConstraints} from './integration/TestConstraints.ts'
import {testInclude} from './integration/TestInclude.ts'
import {testJoins} from './integration/TestJoins.ts'
import {testJson} from './integration/TestJson.ts'
import {testMigration} from './integration/TestMigration.ts'
import {testPreparedQuery} from './integration/TestPreparedQuery.ts'
import {testSubquery} from './integration/TestSubquery.ts'
import {testTransactions} from './integration/TestTransactions.ts'

export async function testDriver(
  meta: ImportMeta,
  createDb: () => Promise<Database>,
  supportsDiff = true
) {
  const db = await createDb()
  suite(meta, test => {
    testBasic(db, test)
    testSubquery(db, test)
    testPreparedQuery(db, test)
    testJoins(db, test)
    testJson(db, test)
    testTransactions(db, test)
    testConstraints(db, test)
    testCTE(db, test)
    testInclude(db, test)

    if (supportsDiff) testMigration(db, test)
  })
}
