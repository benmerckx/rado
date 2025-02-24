import {suite} from '@alinea/suite'
import {testDriver} from '../TestDriver.ts'
import {isDeno} from '../TestRuntime.ts'

await testDriver(suite(import.meta), async () => {
  if (isDeno) return
  const {'@electric-sql/pglite': connect} = await import('@/driver.ts')
  const {PGlite} = await import('@electric-sql/pglite')
  return connect(new PGlite())
})
