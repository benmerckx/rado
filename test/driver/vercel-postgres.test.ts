import {suite} from '@alinea/suite'
import {testDriver} from '../TestDriver.ts'
import {isDeno, testPostgres} from '../TestRuntime.ts'

const test = suite(import.meta)

if (!isDeno && testPostgres) {
  const pgConnection = 'postgres://postgres:postgres@localhost:5432/postgres'
  const {pg: connect} = await import('#/driver.ts')
  const {neonConfig} = await import('@neondatabase/serverless')
  Object.assign(neonConfig, {
    wsProxy: () => 'localhost:5488/v1',
    useSecureWebSocket: false,
    pipelineTLS: false,
    pipelineConnect: false
  })
  const {createClient} = await import('@vercel/postgres')
  const client = createClient({
    connectionString: pgConnection
  })
  await client.connect()

  const db = connect(client)
  testDriver(db, test, 'vercel-postgres')
}
