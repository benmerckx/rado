import {suite} from '@alinea/suite'
import {testDriver} from '../TestDriver.ts'
import {isCi} from '../TestRuntime.ts'

const pgConnection = 'postgres://postgres:postgres@localhost:5432/postgres'
await testDriver(suite(import.meta), async () => {
  if (!isCi) return
  const {pg: connect} = await import('@/driver.ts')
  const {default: pg} = await import('pg')
  const client = new pg.Client({
    connectionString: pgConnection
  })
  await client.connect()
  return connect(client)
})
