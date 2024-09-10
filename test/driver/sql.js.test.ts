import {testDriver} from '../TestDriver.ts'

await testDriver(import.meta, async () => {
  const driver = await import('../../src/driver.ts')
  const {default: init} = await import('sql.js')
  const {Database} = await init()
  return driver['sql.js'](new Database())
})
