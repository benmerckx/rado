import {testDriver} from '../TestDriver.ts'
import {isBun} from '../TestRuntime.ts'

async function createDb() {
  const {Database} = await import('bun:sqlite')
  const {connect} = await import('../../src/driver/bun-sqlite.ts')
  return connect(new Database(':memory:'))
}

if (isBun) await testDriver(import.meta, createDb)
