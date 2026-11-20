import {suite} from '@alinea/suite'
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

  test('neon-http: no interactive transactions', async () => {
    await test.throws(() => db.transaction(async () => {}), 'not supported')
  })

  // Every query runs in its own session, lastInsertId() cannot see the insert
  const sessionless = new Set(['neon-http: joins', 'neon-http: include'])
  const run = Object.assign(
    (name: string, ...args: Array<any>) =>
      (sessionless.has(name) ? test.skip : test)(name, ...(args as [any])),
    test
  )
  testDriver(db, run, 'neon-http')
}
