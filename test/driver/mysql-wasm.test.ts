import {suite} from '@alinea/suite'
import {testDriver} from '../TestDriver.ts'
import {isDeno} from '../TestRuntime.ts'

const test = suite(import.meta)

if (!isDeno) {
  const {'mysql-wasm': connect} = await import('#/driver.ts')
  const {MySQL} = await import('mysql-wasm')
  const db = connect(await MySQL.create())
  testDriver(db, test, 'mysql-wasm')
}
