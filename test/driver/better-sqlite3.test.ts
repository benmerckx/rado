import {Runtime} from '@sinclair/carbon'
import {testDriver} from '../TestDriver.ts'

if (Runtime.isNode())
  await testDriver('better-sqlite3', async () => {
    const {default: Database} = await import('better-sqlite3')
    const {connect} = await import('../../src/driver/better-sqlite3.ts')
    return connect(new Database(':memory:'))
  })
