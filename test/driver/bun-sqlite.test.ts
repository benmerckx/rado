import {isBun} from '../Suite.ts'
import {testDriver} from '../TestDriver.ts'

async function createDb() {
  const {Database} = await import('bun:sqlite')
  const {connect} = await import('../../src/driver/bun-sqlite.ts')
  return connect(new Database(':memory:'))
}

if (isBun) {
  await testDriver(import.meta, createDb)
  //await testSqliteDiff(import.meta, createDb)
}
