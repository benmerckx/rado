import {suite} from '@alinea/suite'
import {testDriver} from '../TestDriver.ts'
import {isNode} from '../TestRuntime.ts'

await testDriver(suite(import.meta), async () => {
  if (!isNode) return
  const {'node:sqlite': connect} = await import('#/driver.ts')
  const sqlite = 'node:sqlite'
  const {DatabaseSync} = await import(sqlite)
  return connect(new DatabaseSync(':memory:'))
})
