import {suite} from '@alinea/suite'
import {testDriver} from '../TestDriver.ts'
import {isDeno} from '../TestRuntime.ts'

await testDriver(suite(import.meta), async () => {
  if (isDeno) return
  const {'@libsql/client': connect} = await import('@/driver.ts')
  const {createClient} = await import('@libsql/client')
  return connect(
    createClient({
      url: 'file::memory:?cache=shared'
    })
  )
})
