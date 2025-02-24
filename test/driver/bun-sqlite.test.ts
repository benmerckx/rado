import {suite} from '@alinea/suite'
import {testDriver} from '../TestDriver.ts'
import {isBun} from '../TestRuntime.ts'

await testDriver(suite(import.meta), async () => {
  if (!isBun) return
  const {'bun:sqlite': connect} = await import('@/driver.ts')
  const {Database} = await import('bun:sqlite')
  return connect(new Database(':memory:'))
})
