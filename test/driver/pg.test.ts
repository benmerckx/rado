import {suite} from '@alinea/suite'
import {testDriver} from '../TestDriver.ts'
import {isDeno, testPostgres} from '../TestRuntime.ts'

const test = suite(import.meta)

if (!isDeno && testPostgres) {
  const pgConnection = 'postgres://postgres:postgres@localhost:5432/postgres'
  const {pg: connect} = await import('#/driver.ts')
  const {default: pg} = await import('pg')

  test('pg: nested pool transactions release the acquired client once', async () => {
    const pool = new pg.Pool({
      connectionString: pgConnection,
      max: 1
    })
    const db = connect(pool)

    try {
      await db.transaction(async tx => {
        await tx.transaction(async () => {})
      })
    } finally {
      await db.close()
    }
  })

  test('pg: transactions do not release a caller-owned pool client', async () => {
    const pool = new pg.Pool({
      connectionString: pgConnection,
      max: 1
    })
    const client = await pool.connect()
    const db = connect(client)

    try {
      await db.transaction(async () => {})
      await client.query('select 1')
    } finally {
      try {
        client.release()
      } finally {
        await pool.end()
      }
    }
  })

  const client = new pg.Client({
    connectionString: pgConnection
  })
  await client.connect()
  const db = connect(client)
  testDriver(db, test, 'pg')
}
