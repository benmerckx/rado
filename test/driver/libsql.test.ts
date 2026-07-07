import {suite} from '@alinea/suite'
import {testDriver} from '../TestDriver.ts'
import {isDeno} from '../TestRuntime.ts'

const test = suite(import.meta)

if (!isDeno) {
  const {'@libsql/client': connect} = await import('#/driver.ts')
  const {createClient} = await import('@libsql/client')
  const db = connect(
    createClient({
      url: 'file::memory:?cache=shared'
    })
  )
  testDriver(db, test)
}
