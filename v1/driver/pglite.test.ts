import {PGlite} from '@electric-sql/pglite'
import {test} from 'bun:test'
import {testDriver} from '../test/TestDriver.ts'
import {connect} from './pglite.ts'

await testDriver(async () => {
  return connect(new PGlite())
}, test)
