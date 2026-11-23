import {suite} from '@alinea/suite'
import {sql} from '#/index.ts'
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

  test('neon: pool reads dates as text', async () => {
    const {Pool, neonConfig} = await import('@neondatabase/serverless')
    Object.assign(neonConfig, client.neonConfig)
    const pool = new Pool({connectionString: pgConnection})
    try {
      const row = await connect(pool).get(
        sql`select '2020-01-01'::date as date, 1::int as int`
      )
      test.equal(row, {date: '2020-01-01', int: 1})
    } finally {
      await pool.end()
    }
  })

  test('neon: pool over fetch reads dates as text', async () => {
    const {Pool, neonConfig} = await import('@neondatabase/serverless')
    const {poolQueryViaFetch, fetchEndpoint} = neonConfig
    Object.assign(neonConfig, {
      poolQueryViaFetch: true,
      fetchEndpoint: 'http://localhost:4444/sql'
    })
    const pool = new Pool({
      connectionString:
        'postgres://postgres:postgres@db.localtest.me:5432/postgres'
    })
    try {
      const row = await connect(pool).get(
        sql`select '2020-01-01'::date as date, 1::int as int`
      )
      test.equal(row, {date: '2020-01-01', int: 1})
      // Queried over fetch, without opening a connection
      test.equal(pool.totalCount, 0)
    } finally {
      Object.assign(neonConfig, {poolQueryViaFetch, fetchEndpoint})
      await pool.end()
    }
  })

  testDriver(db, test, 'vercel-postgres')
}
