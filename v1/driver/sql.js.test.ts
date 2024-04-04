import {test} from 'bun:test'
import init from 'sql.js'
import {testDriver} from '../test/TestDriver.ts'
import {connect} from './sql.js.ts'

testDriver(async () => {
  const {Database} = await init()
  return connect(new Database())
}, test)
