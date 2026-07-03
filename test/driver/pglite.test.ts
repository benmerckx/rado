import {testDriver} from '../TestDriver.ts'
import {isDeno} from '../TestRuntime.ts'

await testDriver(import.meta, async () => {
  if (isDeno) return
  const {'@electric-sql/pglite': connect} = await import('#/driver.ts')
  const {PGlite} = await import('@electric-sql/pglite')
  return connect(new PGlite())
})
