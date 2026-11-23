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

const Parent = table('mig_parent', {id: integer().primaryKey(), name: text()})
const Strict = table('mig_parent', {
  id: integer().primaryKey(),
  name: text().notNull().default('x')
})
const Child = table('mig_child', {
  id: integer().primaryKey(),
  parent: integer().references(() => Parent.id, {onDelete: 'cascade'})
})

const Keys = table('pragma_foreign_keys', {foreign_keys: integer()})

export function testMigrate(db: Database, test: DefineTest) {
  const generate = generates[db.dialect.runtime]
  const transactional =
    db.driver.supportsTransactions && db.dialect.runtime !== 'mysql'
  const reset = async () => {
    const tables = ['mig_a', 'mig_b', 'mig_c', 'mig_user', 'mig_child']
    for (const name of [...tables, 'mig_parent'])
      await db.run(sql`drop table if exists ${sql.identifier(name)}`)
    await db.drop(History)
  }
  const names = () =>
    db.select(History.name).from(History).orderBy(History.name)

  if (db.driver.multipleStatements === false) {
    test('migrate refuses single statement drivers', async () => {
      test.equal(
        await failure(() => migrate(db, files)),
        db.dialect.runtime === 'mysql'
          ? 'Migrations need multipleStatements: true'
          : 'Migrate over the websocket Pool, Neon HTTP runs one statement per query'
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
      // Normalized like the file names
      const options = {baseline: './migrations/0001_init.sql'}
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

  // D1 always enforces foreign keys, see docs/runtime/migrations.md
  if (db.dialect.runtime === 'sqlite' && db.driver.supportsTransactions)
    test('generate rebuild keeps referencing rows', async () => {
      const [keys] = await db.select(Keys.foreign_keys).from(Keys)
      await fixture(reset, async () => {
        const first = {'0001_init.sql': await generate({}, {Parent, Child})}
        const next = await generate(first, {Parent: Strict, Child})
        test.equal(next.startsWith('pragma defer_foreign_keys = on;'), true)
        const comment = '-- Makes column "name" not null over null values'
        test.equal(next.includes(`${comment}\ninsert into`), true)
        await db.run(sql`pragma foreign_keys = on`)
        await migrate(db, first)
        await db.insert(Parent).values({id: 1})
        await db.insert(Child).values({id: 1, parent: 1})
        await migrate(db, {...first, '0002_strict.sql': next})
        test.equal(await db.select(Child.id).from(Child), [1])
        test.equal(await db.select(Strict.name).from(Strict), ['x'])
        test.equal(await db.select(Keys.foreign_keys).from(Keys), [1])
      })
      if (!keys) await db.run(sql`pragma foreign_keys = off`)
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
