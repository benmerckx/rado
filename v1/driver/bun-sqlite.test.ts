import {Database} from 'bun:sqlite'
import {test} from 'bun:test'
import {testDriver} from '../test/TestDriver.ts'
import {connect} from './bun-sqlite.ts'

testDriver(async () => {
  return connect(new Database(':memory:'))
}, test)
