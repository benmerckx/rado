import {suite} from '@alinea/suite'
import {sql} from '#/index.ts'
import {testDriver} from '../TestDriver.ts'
import {testServers} from '../TestRuntime.ts'

const test = suite(import.meta)

if (testServers) {
  const {'neon-http': connect} = await import('#/driver.ts')
  const {neon, neonConfig} = await import('@neondatabase/serverless')
  // Served by local-neon-http-proxy, see docker-compose.yml
  neonConfig.fetchEndpoint = 'http://localhost:4444/sql'
  const db = connect(
    neon('postgres://postgres:postgres@db.localtest.me:5432/postgres')
  )

  test('neon-http: batch runs in one transaction', async () => {
    const results = await db.driver.batch([
      {sql: 'create temporary sequence s', params: [], isSelection: false},
      {sql: 'select nextval($1)', params: ['s'], isSelection: true}
    ])
    test.equal(results, [[], [['1']]])
  })

  test('neon-http: dates and timestamps come back as text', async () => {
    const query = `select '2020-01-01'::date as date,
      '2020-01-01 10:00'::timestamp as timestamp,
      '1 day'::interval as interval, 1::int as int`
    test.equal(await db.get(sql.unsafe(query)), {
      date: '2020-01-01',
      timestamp: '2020-01-01 10:00:00',
      interval: '1 day',
      int: 1
    })
    const [rows] = await db.driver.batch([
      {sql: query, params: [], isSelection: true}
    ])
    test.equal(rows, [['2020-01-01', '2020-01-01 10:00:00', '1 day', 1]])
  })

  test('neon-http: no interactive transactions', async () => {
    const error = await db
      .transaction(async () => {})
      .catch(error => error.message)
    test.equal(error, 'Transactions are not supported over Neon HTTP')
  })

  // Every query runs in its own session: lastInsertId() cannot see the
  // insert, and inspect needs an interactive transaction
  const sessionless = new Set(
    [
      'joins',
      'include',
      'inspect tables, keys and views',
      'inspect reads odd identifiers',
      'inspect reads generated columns'
    ].map(name => `neon-http: ${name}`)
  )
  const run = Object.assign(
    (name: string, ...args: Array<any>) =>
      (sessionless.has(name) ? test.skip : test)(name, ...(args as [any])),
    test
  )
  testDriver(db, run, 'neon-http')
}
