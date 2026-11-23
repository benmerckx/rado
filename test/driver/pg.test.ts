import {suite} from '@alinea/suite'
import {sql} from '#/index.ts'
import {testDriver} from '../TestDriver.ts'
import {testServers} from '../TestRuntime.ts'

const test = suite(import.meta)

if (testServers) {
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

  test('pg: dates and timestamps come back as text', async () => {
    const pool = new pg.Pool({connectionString: pgConnection, max: 1})
    const row = sql`select '2020-01-01'::date as date,
      '2020-01-01 10:00:00.5'::timestamp as timestamp,
      '1 day'::interval as interval, 1::int as int, '{"a":1}'::jsonb as json`
    const expected = {
      date: '2020-01-01',
      timestamp: '2020-01-01 10:00:00.5',
      interval: '1 day',
      int: 1,
      json: {a: 1}
    }
    try {
      const pooled = connect(pool)
      test.equal(await db.get(row), expected)
      test.equal(await pooled.get(row), expected)
      test.equal(await pooled.transaction(tx => tx.get(row)), expected)
    } finally {
      await pool.end()
    }
  })

  testDriver(db, test, 'pg')
}
