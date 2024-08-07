import {connect} from '../../src/driver/sql.js.ts'
import {testDriver} from '../TestDriver.ts'

await testDriver(import.meta, async () => {
  const {default: init} = await import('sql.js')
  const {Database} = await init()
  return connect(new Database())
})
