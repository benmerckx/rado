import {PGlite} from '@electric-sql/pglite'
import {connect} from '../../src/driver/pglite.ts'
import {testDriver} from '../TestDriver.ts'

if (process?.platform !== 'win32')
  await testDriver('pglite', async () => {
    return connect(new PGlite())
  })
