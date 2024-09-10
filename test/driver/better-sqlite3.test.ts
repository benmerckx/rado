import {testDriver} from '../TestDriver.ts'
import {isNode} from '../TestRuntime.ts'

if (isNode)
  await testDriver(import.meta, async () => {
    const {default: Database} = await import('better-sqlite3')
    const driver = await import('../../src/driver.ts')
    return driver['better-sqlite3'](new Database(':memory:'))
  })
