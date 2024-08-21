import {testDriver} from '../TestDriver.ts'
import {isDeno} from '../TestRuntime.ts'

async function createDb() {
  // @ts-ignore
  const {Database} = await import('jsr:@db/sqlite')
  const {connect} = await import('../../src/driver/@db/sqlite.ts')
  return connect(new Database(':memory:'))
}

if (isDeno) await testDriver(import.meta, createDb)
