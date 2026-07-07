import {suite} from '@alinea/suite'
import {testDriver} from '../TestDriver.ts'
import {isNode} from '../TestRuntime.ts'

const test = suite(import.meta)

if (isNode) {
  const {d1: connect} = await import('#/driver.ts')
  const {createSQLiteDB} = await import('@miniflare/shared')
  const {D1Database, D1DatabaseAPI} = await import('@miniflare/d1')
  const db = connect(
    <any>new D1Database(new D1DatabaseAPI(await createSQLiteDB(':memory:')))
  )
  testDriver(db, test)
}
