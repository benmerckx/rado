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
    let queries = 0
    const query = pool.query.bind(pool)
    pool.query = ((...args: Parameters<typeof query>) => {
      queries++
      return query(...args)
    }) as typeof pool.query
    try {
      const pooled = connect(pool)
      test.equal(await db.get(row), expected)
      test.equal(await pooled.get(row), expected)
      test.equal(await pooled.transaction(tx => tx.get(row)), expected)
      // Pools are queried as is, neon relies on that to query over fetch
      test.equal(queries, 1)
    } finally {
      await pool.end()
    }
  })

  test('pg: pools behind a proxy, like the sql export of @vercel/postgres', async () => {
    const pool = new pg.Pool({connectionString: pgConnection, max: 2})
    const proxy = new Proxy(() => {}, {
      get(_, key) {
        const value = Reflect.get(pool, key)
        return typeof value === 'function' ? value.bind(pool) : value
      }
    })
    const proxied = connect(proxy as unknown as typeof pool)
    try {
      test.equal(await proxied.get(sql`select '2020-01-01'::date as date`), {
        date: '2020-01-01'
      })
      // A pool taken for a client would run each statement on any connection
      await proxied.transaction(async tx => {
        await tx.run(sql`create temp table proxied (x int) on commit drop`)
        await tx.run(sql`insert into proxied values (1)`)
      })
    } finally {
      await pool.end()
    }
  })

  testDriver(db, test, 'pg')
}
