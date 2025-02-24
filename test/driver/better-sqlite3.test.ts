import {suite} from '@alinea/suite'
import {testDriver} from '../TestDriver.ts'
import {isNode} from '../TestRuntime.ts'

await testDriver(suite(import.meta), async () => {
  if (!isNode) return
  const {'better-sqlite3': connect} = await import('@/driver.ts')
  const {default: Database} = await import('better-sqlite3')
  return connect(new Database(':memory:'))
})
