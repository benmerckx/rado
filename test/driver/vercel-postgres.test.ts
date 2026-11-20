import {suite} from '@alinea/suite'
import {testDriver} from '../TestDriver.ts'
import {testServers} from '../TestRuntime.ts'

const test = suite(import.meta)

if (testServers) {
  const pgConnection = 'postgres://postgres:postgres@localhost:5432/postgres'
  const {pg: connect} = await import('#/driver.ts')
  const {createClient} = await import('@vercel/postgres')
  const client = createClient({
    connectionString: pgConnection
  })
  // @vercel/postgres depends on its own copy of @neondatabase/serverless
  Object.assign(client.neonConfig, {
    wsProxy: () => 'localhost:5488/v1',
    useSecureWebSocket: false,
    pipelineTLS: false,
    pipelineConnect: false
  })
  await client.connect()

  const db = connect(client)
  testDriver(db, test, 'vercel-postgres')
}
