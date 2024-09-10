import {testDriver} from '../TestDriver.ts'
import {isBun} from '../TestRuntime.ts'

async function createDb() {
  const {Database} = await import('bun:sqlite')
  const driver = await import('../../src/driver.ts')
  return driver['bun:sqlite'](new Database(':memory:'))
}

if (isBun) await testDriver(import.meta, createDb)
