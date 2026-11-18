import {suite} from '@alinea/suite'
import {testDriver} from '../TestDriver.ts'
import {isNode} from '../TestRuntime.ts'
import {failure} from '../TestUtils.ts'

const test = suite(import.meta)

if (isNode) {
  const {d1: connect} = await import('#/driver.ts')
  const {createSQLiteDB} = await import('@miniflare/shared')
  const {D1Database, D1DatabaseAPI} = await import('@miniflare/d1')
  const db = connect(
    <any>new D1Database(new D1DatabaseAPI(await createSQLiteDB(':memory:')))
  )
  test('d1: push needs transactions', async () => {
    const {push} = await import('#/sqlite/push.ts')
    const {table} = await import('#/index.ts')
    const {integer} = await import('#/sqlite.ts')
    const {sql} = await import('#/index.ts')
    await db.run(sql`pragma foreign_keys = on`)
    const error = await failure(() =>
      push(db, table('d1_push', {id: integer()}))
    )
    test.equal(error, 'Push needs a driver with transactions')
    test.equal(
      await db.get(
        sql<{on: number}>`select foreign_keys as "on" from pragma_foreign_keys`
      ),
      {on: 1}
    )
  })

  testDriver(db, test, 'd1')
}
