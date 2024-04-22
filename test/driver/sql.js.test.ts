import init from 'sql.js'
import {connect} from '../../src/driver/sql.js.ts'
import {testDriver} from '../TestDriver.ts'

await testDriver('sql.js', async () => {
  const {Database} = await init()
  return connect(new Database())
})
