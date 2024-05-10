import {testDriver} from '../TestDriver.ts'
import {isNode} from '../suite.ts'

if (isNode)
  await testDriver(import.meta, async () => {
    const {default: Database} = await import('better-sqlite3')
    const {connect} = await import('../../src/driver/better-sqlite3.ts')
    return connect(new Database(':memory:'))
  })
