import {testDriver} from '../TestDriver.ts'

if (process?.isBun)
  await testDriver('bun-sqlite', async () => {
    const {Database} = await import('bun:sqlite')
    const {connect} = await import('../../src/driver/bun-sqlite.ts')
    return connect(new Database(':memory:'))
  })
