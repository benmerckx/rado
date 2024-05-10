import {isBun} from '../Suite.ts'
import {testDriver} from '../TestDriver.ts'

if (isBun)
  await testDriver(import.meta, async () => {
    const {Database} = await import('bun:sqlite')
    const {connect} = await import('../../src/driver/bun-sqlite.ts')
    return connect(new Database(':memory:'))
  })
