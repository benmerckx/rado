import {suite} from '@alinea/suite'
import {testDriver} from '../TestDriver.ts'

await testDriver(suite(import.meta), async () => {
  const {'sql.js': connect} = await import('@/driver.ts')
  const {default: init} = await import('sql.js')
  const {Database} = await init()
  return connect(new Database())
})
