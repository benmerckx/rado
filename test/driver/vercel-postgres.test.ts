import {suite} from '@alinea/suite'
import {testDriver} from '../TestDriver.ts'
import {isCi} from '../TestRuntime.ts'

const pgConnection = 'postgres://postgres:postgres@localhost:5432/postgres'
await testDriver(suite(import.meta), async () => {
  if (!isCi) return
  const {pg: connect} = await import('@/driver.ts')
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

  // VercelClient bundles its own copy of pg's Client type which lacks the
  // internal connection property, but is compatible at runtime
  return connect(client as unknown as Parameters<typeof connect>[0])
})
