import {suite} from '@alinea/suite'
import {testDriver} from '../TestDriver.ts'
import {isDeno} from '../TestRuntime.ts'

const test = suite(import.meta)

if (!isDeno) {
  const {'@electric-sql/pglite': connect} = await import('#/driver.ts')
  const {PGlite} = await import('@electric-sql/pglite')
  const db = connect(new PGlite())
  testDriver(db, test)
}
