import {suite} from '@alinea/suite'
import {testDriver} from '../TestDriver.ts'
import {isNode} from '../TestRuntime.ts'

await testDriver(suite(import.meta), async () => {
  if (!isNode) return
  const {d1: connect} = await import('@/driver.ts')
  const {createSQLiteDB} = await import('@miniflare/shared')
  const {D1Database, D1DatabaseAPI} = await import('@miniflare/d1')
  return connect(
    <any>new D1Database(new D1DatabaseAPI(await createSQLiteDB(':memory:')))
  )
})
