import {connect} from '../../src/driver/pglite.ts'
import {testDriver} from '../TestDriver.ts'

await testDriver(import.meta, async () => {
  const {PGlite} = await import('@electric-sql/pglite')
  return connect(new PGlite())
})
