import {suite} from '@alinea/suite'
import {testDriver} from '../TestDriver.ts'
import {isBun} from '../TestRuntime.ts'

const test = suite(import.meta)

if (isBun) {
  const {'bun:sqlite': connect} = await import('#/driver.ts')
  const {Database} = await import('bun:sqlite')
  const db = connect(new Database(':memory:'))
  testDriver(db, test)
}
