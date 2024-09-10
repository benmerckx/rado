import {testDriver} from '../TestDriver.ts'
import {isDeno} from '../TestRuntime.ts'

async function createDb() {
  const {Database} = await import('@db/sqlite')
  const driver = await import('../../src/driver.ts')
  return driver['@db/sqlite'](new Database(':memory:'))
}

if (isDeno) await testDriver(import.meta, createDb)
