import {suite} from '@alinea/suite'
import {sql} from '#/index.ts'
import {testDriver} from '../TestDriver.ts'
import {testServers} from '../TestRuntime.ts'

const test = suite(import.meta)

if (testServers) {
  const {postgres: connect} = await import('#/driver.ts')
  const {default: postgres} = await import('postgres')
  const url = 'postgres://postgres:postgres@localhost:5432/postgres'
  const db = connect(postgres(url, {onnotice() {}}))

  test('postgres: transaction options', async () => {
    const isolation = sql<{level: string}>`
      select current_setting('transaction_isolation') as level`
    const row = await db.transaction(tx => tx.get(isolation), {
      isolationLevel: 'serializable'
    })
    test.equal(row, {level: 'serializable'})
  })

  testDriver(db, test, 'postgres')
}
