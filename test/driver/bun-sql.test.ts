import {suite} from '@alinea/suite'
import {sql} from '#/index.ts'
import {testDriver} from '../TestDriver.ts'
import {isBun, testServers} from '../TestRuntime.ts'

const test = suite(import.meta)

if (isBun) {
  const {'bun-sql': connect} = await import('#/driver.ts')
  const {SQL} = await import('bun')

  testDriver(connect<'sqlite'>(new SQL(':memory:')), test, 'bun-sql sqlite')

  if (testServers) {
    const postgres = connect(
      new SQL('postgres://postgres:postgres@localhost:5432/postgres')
    )
    const mysql = connect<'mysql'>(
      new SQL('mysql://root:mysql@localhost:3306/mysql')
    )

    test('bun-sql: postgres transaction options', async () => {
      const isolation = sql<{level: string}>`
        select current_setting('transaction_isolation') as level`
      const row = await postgres.transaction(tx => tx.get(isolation), {
        isolationLevel: 'serializable'
      })
      test.equal(row, {level: 'serializable'})
    })

    test('bun-sql: mysql transaction options', async () => {
      await mysql.run(sql`create table BunSqlReadOnly (id int)`)
      try {
        const insert = sql`insert into BunSqlReadOnly values (1)`
        const error = await mysql
          .transaction(tx => tx.run(insert), {accessMode: 'read only'})
          .catch(error => error.message)
        test.equal(/read only/i.test(error), true)
      } finally {
        await mysql.run(sql`drop table BunSqlReadOnly`)
      }
    })

    testDriver(postgres, test, 'bun-sql postgres')
    testDriver(mysql, test, 'bun-sql mysql')
  }
}
