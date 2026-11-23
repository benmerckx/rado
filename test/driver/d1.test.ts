import {suite} from '@alinea/suite'
import {testDriver} from '../TestDriver.ts'
import {isNode} from '../TestRuntime.ts'
import {failure} from '../TestUtils.ts'

const test = suite(import.meta)

if (isNode) {
  const {d1: connect} = await import('#/driver.ts')
  const {createSQLiteDB} = await import('@miniflare/shared')
  const {D1Database, D1DatabaseAPI} = await import('@miniflare/d1')
  const db = connect(
    <any>new D1Database(new D1DatabaseAPI(await createSQLiteDB(':memory:')))
  )
  test('d1: push needs transactions', async () => {
    const {push} = await import('#/sqlite/push.ts')
    const {table} = await import('#/index.ts')
    const {integer} = await import('#/sqlite.ts')
    const {sql} = await import('#/index.ts')
    await db.run(sql`pragma foreign_keys = on`)
    const error = await failure(() =>
      push(db, {table: table('d1_push', {id: integer()})})
    )
    test.equal(error, 'Push needs a driver with transactions')
    test.equal(
      await db.get(
        sql<{on: number}>`select foreign_keys as "on" from pragma_foreign_keys`
      ),
      {on: 1}
    )
  })

  test('d1: migrate a multi-line file', async () => {
    const {migrate} = await import('#/migrate.ts')
    const {sql} = await import('#/index.ts')
    const file = [
      '-- Notes, with a trigger',
      'create table d1_note (',
      '  id integer primary key, -- the key',
      "  body text not null default 'a;b'",
      ');',
      '',
      'create table d1_log (id integer);',
      // Miniflare's D1 only finds a trigger body after an uppercase BEGIN
      'create trigger d1_logged after insert on d1_note BEGIN',
      '  insert into d1_log values (new.id);',
      'END;',
      'insert into d1_note (id) values (1);'
    ].join('\r\n')
    try {
      test.equal(await migrate(db, {'0001_note.sql': file}), ['0001_note'])
      test.equal(await db.all(sql<{id: number}>`select id from d1_log`), [
        {id: 1}
      ])
      const error = await failure(() =>
        migrate(db, {
          '0001_note.sql': file,
          '0002_bad.sql': 'insert into d1_missing values (1);'
        })
      )
      test.equal(error.includes('no such table: d1_missing'), true)
    } finally {
      for (const name of ['d1_note', 'd1_log', 'rado_migrations'])
        await db.run(sql`drop table if exists ${sql.identifier(name)}`)
    }
  })

  testDriver(db, test, 'd1')
}
