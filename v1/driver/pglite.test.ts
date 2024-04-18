import {PGlite} from '@electric-sql/pglite'
import {test} from 'bun:test'
import {testDriver} from '../test/TestDriver.ts'
import {connect} from './pglite.ts'

if (process.platform !== 'win32')
  await testDriver(async () => {
    return connect(new PGlite())
  }, test)
