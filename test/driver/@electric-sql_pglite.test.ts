import {testDriver} from '../TestDriver.ts'

await testDriver(import.meta, async () => {
  const driver = await import('../../src/driver.ts')
  const {PGlite} = await import('@electric-sql/pglite')
  return driver['@electric-sql/pglite'](new PGlite())
})
