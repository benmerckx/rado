import {Os} from '@sinclair/carbon'
import {connect} from '../../src/driver/pglite.ts'
import {testDriver} from '../TestDriver.ts'

if (Os.type() !== 'win32')
  await testDriver('pglite', async () => {
    const {PGlite} = await import('@electric-sql/pglite')
    return connect(new PGlite())
  })
