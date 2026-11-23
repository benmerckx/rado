import type {DefineTest} from '@alinea/suite'
import {type Database, sql, table} from '#/index.ts'
import {migrate} from '#/migrate.ts'
import {generate as mysql} from '#/mysql/generate.ts'
import {generate as postgres} from '#/postgres/generate.ts'
import {generate as sqlite} from '#/sqlite/generate.ts'
import {id, integer, text} from '#/universal.ts'
import {failure, fixture} from '../TestUtils.ts'

const generates = {sqlite, postgres, mysql}

const History = table('rado_migrations', {name: text(), checksum: text()})
const A = table('mig_a', {id: integer()})
const B = table('mig_b', {id: integer()})

const files = {
  './migrations/0001_init.sql':
    'create table mig_a (id integer);\ninsert into mig_a values (1);',
  './migrations/0002_more.sql':
    'create table mig_b (id integer);\ninsert into mig_b values (2);'
}

const bad = {
  ...files,
  './migrations/0003_bad.sql':
    'create table mig_c (id integer);\ninsert into mig_missing values (1);'
}

const User = table('mig_user', {id: id(), name: text()})

export function testMigrate(db: Database, test: DefineTest) {
  const generate = generates[db.dialect.runtime]
  const transactional =
    db.driver.supportsTransactions && db.dialect.runtime !== 'mysql'
  const reset = async () => {
    for (const name of ['mig_a', 'mig_b', 'mig_c', 'mig_user'])
      await db.run(sql`drop table if exists ${sql.identifier(name)}`)
    await db.drop(History)
  }
  const names = () =>
    db.select(History.name).from(History).orderBy(History.name)

  if (db.driver.singleStatement) {
    test('migrate refuses single statement drivers', async () => {
      test.equal(
        await failure(() => migrate(db, files)),
        db.driver.singleStatement
      )
    })
    return
  }

  test('migrate applies and records', async () => {
    await fixture(reset, async () => {
      test.equal(await migrate.pending(db, files), ['0001_init', '0002_more'])
      test.equal(await migrate(db, files), ['0001_init', '0002_more'])
      test.equal(await db.select(A.id).from(A), [1])
      test.equal(await db.select(B.id).from(B), [2])
      test.equal(await names(), ['0001_init', '0002_more'])
      test.equal(await migrate(db, files), [])
      test.equal(await migrate.pending(db, files), [])
    })
  })

  test('migrate pending', async () => {
    await fixture(reset, async () => {
      const first = {'0001_init.sql': files['./migrations/0001_init.sql']}
      test.equal(await migrate(db, first), ['0001_init'])
      test.equal(await migrate.pending(db, files), ['0002_more'])
      test.equal((await failure(() => db.select(B).from(B))) !== '', true)
    })
  })

  test('migrate checks applied files', async () => {
    await fixture(reset, async () => {
      await migrate(db, files)
      const changed = {...files, './migrations/0001_init.sql': 'select 1;'}
      test.equal(
        await failure(() => migrate(db, changed)),
        'Migration 0001_init changed after it was applied'
      )
      test.equal(
        await failure(() => migrate.pending(db, changed)),
        'Migration 0001_init changed after it was applied'
      )
      const missing = {'0002_more.sql': files['./migrations/0002_more.sql']}
      test.equal(
        await failure(() => migrate(db, missing)),
        'Migration 0001_init was applied but is missing'
      )
      test.equal(
        await failure(() => migrate(db, {'a/0001.sql': '', 'b/0001.sql': ''})),
        'Migration 0001 is defined twice'
      )
    })
  })

  test('migrate baseline', async () => {
    await fixture(reset, async () => {
      await db.run(sql`create table mig_a (id integer)`)
      const options = {baseline: '0001_init'}
      test.equal(await migrate(db, files, options), ['0002_more'])
      test.equal(await db.select(A.id).from(A), [])
      test.equal(await names(), ['0001_init', '0002_more'])
      test.equal(await migrate(db, files, options), [])
      await db.drop(History)
      test.equal(
        await failure(() => migrate(db, files, {baseline: 'nope'})),
        'Unknown baseline nope'
      )
    })
  })

  test('migrate failure', async () => {
    await fixture(reset, async () => {
      await migrate(db, {'0001_init.sql': files['./migrations/0001_init.sql']})
      const error = await failure(() => migrate(db, bad))
      if (transactional) {
        test.equal(error.startsWith('Migration 0003_bad failed: '), true)
        test.equal(await names(), ['0001_init'])
        test.equal((await failure(() => db.select(B).from(B))) !== '', true)
      } else {
        const message = 'Migration 0003_bad failed and may be partially applied'
        test.equal(error.startsWith(message), true)
        test.equal(await names(), ['0001_init', '0002_more'])
      }
    })
  })

  test('generate round trip', async () => {
    await fixture(reset, async () => {
      const init = await generate({}, {User, other: 1})
      test.equal(init.startsWith('create table'), true)
      const all = {'0001_init.sql': init}
      test.equal(await migrate(db, all), ['0001_init'])
      await db.insert(User).values({name: 'a'})
      test.equal(await db.select(User.name).from(User), ['a'])
      test.equal(await generate(all, {User}), '')
    })
  })
}
