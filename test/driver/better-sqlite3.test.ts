import {suite} from '@alinea/suite'
import {testDriver} from '../TestDriver.ts'
import {isNode} from '../TestRuntime.ts'

const test = suite(import.meta)

if (isNode) {
  const {'better-sqlite3': connect} = await import('#/driver.ts')
  const {default: Database} = await import('better-sqlite3')
  const db = connect(new Database(':memory:'))
  testDriver(db, test, 'better-sqlite3')
}
