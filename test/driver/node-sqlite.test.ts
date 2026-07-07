import {suite} from '@alinea/suite'
import {testDriver} from '../TestDriver.ts'
import {isNode} from '../TestRuntime.ts'

const test = suite(import.meta)

if (isNode) {
  const {'node:sqlite': connect} = await import('#/driver.ts')
  const sqlite = 'node:sqlite'
  const {DatabaseSync} = await import(sqlite)
  const db = connect(new DatabaseSync(':memory:'))
  testDriver(db, test)
}
