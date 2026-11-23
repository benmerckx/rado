import {suite} from '@alinea/suite'
import {type Generate, load} from '#/core/Generate.ts'
import type {QueryDialect, QueryMeta} from '#/core/MetaData.ts'
import {type Database, sql, table} from '#/index.ts'
import {integer as pgInteger, pgSchema, serial} from '#/postgres.ts'
import {uniqueIndex} from '#/sqlite.ts'
import {id, integer, text, varchar} from '#/universal.ts'
import {isBun, isDeno} from '../TestRuntime.ts'
import {failure} from '../TestUtils.ts'

const test = suite(import.meta)

const User = table('gen_user', {id: id(), name: text(), bio: text()})
const Renamed = table('gen_user', {id: id(), fullName: text('full_name')})
const Code = table('gen_code', {
  id: id(),
  code: varchar(undefined, {length: 20})
})
const Unique = table(
  'gen_code',
  {id: id(), code: varchar(undefined, {length: 20})},
  t => ({gen_code_key: uniqueIndex().on(t.code)})
)
const Ref = table('gen_ref', {id: id(), code: integer()})
const Plain = table('gen_mooded', {id: integer()})
const Linked = table('gen_ref', {
  id: id(),
  code: integer().references(() => Code.id)
})
const OnlyId = table('gen_user', {id: id()})
const Extra = table('gen_user', {
  id: id(),
  fullName: text('full_name'),
  extra: text().notNull()
})

function testGenerate<D extends QueryDialect>(
  label: D,
  entry: () => Promise<{generate: Generate<D>}>,
  open: () => Promise<Database<QueryMeta & {dialect: D}>>
) {
  test(`${label}: generate`, async () => {
    const {generate} = await entry()
    const shadow = await open()
    const init = await generate({}, {User}, {shadow})
    test.equal(init.startsWith('create table'), true)
    test.equal(init.endsWith(';'), true)
    // A passed shadow is left open, and is no longer empty
    test.equal(
      await failure(() => generate({}, {User}, {shadow})),
      'Expected an empty database'
    )
    await shadow.driver.close()
    const first = {'0001_init.sql': init}
    const rename = {rename: {'gen_user.name': 'full_name'}}
    const next = await generate(first, {Renamed}, rename)
    test.equal(next.includes('rename column'), true)
    // MySQL alters the table once, the comment goes above that statement
    test.equal(/-- Drops column "bio"\n[^\n]*drop column/.test(next), true)
    const second = {...first, '0002_rename.sql': next}
    test.equal(await generate(second, {Renamed}), '')
    // Fails on a table with rows, so it's marked
    const extra = await generate(second, {Extra})
    const comment = '-- Adds not null column "extra" without a default'
    test.equal(extra.includes(`${comment}\n`), true)
    // New keys fail on rows they don't hold
    const keyed = {'0001_init.sql': await generate({}, {Code, Ref})}
    const keys = await generate(keyed, {Code: Unique, Ref: Linked})
    test.equal(keys.includes('-- Adds unique key "gen_code_key", fails'), true)
    test.equal(keys.includes('-- Adds foreign key'), true)
    // One comment line per risk of a statement
    const both = await generate(first, {User: OnlyId})
    test.equal(both.includes('-- Drops column "name"'), true)
    test.equal(both.includes('-- Drops column "bio"'), true)
    if (label === 'mysql') test.equal(/-- [^\n]*\n-- /.test(both), true)
  })
}

test('generate needs its peer dependency', async () => {
  const name = '@electric-sql/pglite'
  const missing = () => import('rado-missing-package' as string)
  test.equal(
    await failure(() => load(name, missing)),
    'Install @electric-sql/pglite or pass a shadow database'
  )
})

testGenerate(
  'sqlite',
  () => import('#/sqlite/generate.ts'),
  async () => {
    if (isBun) {
      const {Database} = await import('bun:sqlite')
      const {connect} = await import('#/driver/bun-sqlite.ts')
      return connect(new Database(':memory:'))
    }
    const {DatabaseSync} = await import('node:sqlite' as string)
    const {connect} = await import('#/driver/node-sqlite.ts')
    return connect(new DatabaseSync(':memory:'))
  }
)

if (!isDeno) {
  testGenerate(
    'postgres',
    () => import('#/postgres/generate.ts'),
    async () => {
      const {PGlite} = await import('@electric-sql/pglite')
      const {connect} = await import('#/driver/pglite.ts')
      return connect(new PGlite())
    }
  )
  testGenerate(
    'mysql',
    () => import('#/mysql/generate.ts'),
    async () => {
      const {MySQL} = await import('mysql-wasm')
      const {connect} = await import('#/driver/mysql-wasm.ts')
      return connect(await MySQL.create())
    }
  )

  test('postgres: generate leaves out the home schema', async () => {
    const {generate} = await import('#/postgres/generate.ts')
    const app = pgSchema('gen_app')
    const Note = table('gen_note', {
      id: id(),
      body: text().default(sql`'see "public".x'`),
      user: integer().references(() => User.id)
    })
    const Archive = app.table('gen_archive', {id: id()})
    // Push creates the schema a new table is in
    const init = await generate({}, {User, Note, Archive})
    test.equal(init.includes('create schema if not exists "gen_app";'), true)
    const literal = `'see "public".x'`
    test.equal(init.includes(literal), true)
    test.equal(/"?public"?\./.test(init.replace(literal, '')), false)
    test.equal(init.includes('"gen_app"."gen_archive"'), true)
    test.equal(await generate({'0001.sql': init}, {User, Note, Archive}), '')
  })

  test('postgres: generate settles on an enum in a schema', async () => {
    const {generate} = await import('#/postgres/generate.ts')
    const {push} = await import('#/postgres/push.ts')
    const app = pgSchema('gen_settle')
    const Org = app.table('gen_org', {mood: app.enum('gen_mood', ['a'])()})
    const init = await generate({}, {Org})
    test.equal(await generate({'0001.sql': init}, {Org}), '')
    const {PGlite} = await import('@electric-sql/pglite')
    const {connect} = await import('#/driver/pglite.ts')
    const db = connect(new PGlite())
    await push(db, {Org})
    test.equal(await push.plan(db, {Org}), [])
    await db.close()
  })

  test('postgres: generate a schema for an enum', async () => {
    const {generate} = await import('#/postgres/generate.ts')
    const zz = pgSchema('gen_zz')
    const Mooded = table('gen_mooded', {
      id: integer(),
      mood: zz.enum('gen_mood', ['a'])()
    })
    const init = await generate({}, {Mooded})
    const schema = init.indexOf('create schema if not exists "gen_zz";')
    test.equal(schema >= 0 && schema < init.indexOf('gen_mood'), true)
    test.equal(await generate({'0001.sql': init}, {Mooded}), '')
    // An existing table with a new enum column gets the schema too
    const first = {'0001.sql': await generate({}, {Plain})}
    const next = await generate(first, {Plain: Mooded})
    test.equal(next.startsWith('create schema if not exists "gen_zz";'), true)
  })

  test('postgres: generate needs an empty shadow', async () => {
    const {generate} = await import('#/postgres/generate.ts')
    const {PGlite} = await import('@electric-sql/pglite')
    const {connect} = await import('#/driver/pglite.ts')
    for (const statement of [
      "create type gen_kind as enum ('a')",
      'create sequence gen_seq',
      'create schema gen_other'
    ]) {
      const shadow = connect(new PGlite())
      await shadow.run(sql.unsafe(statement))
      test.equal(
        await failure(() => generate({}, {User}, {shadow})),
        'Expected an empty database'
      )
      await shadow.close()
    }
  })

  test('postgres: generate serial to identity', async () => {
    const {generate} = await import('#/postgres/generate.ts')
    const {migrate} = await import('#/migrate.ts')
    const Serial = table('gen_counter', {id: serial().primaryKey()})
    const Identity = table('gen_counter', {
      id: pgInteger().generatedByDefaultAsIdentity().primaryKey()
    })
    const first = {'0001_init.sql': await generate({}, {Serial})}
    const next = await generate(first, {Identity})
    test.equal(next.includes('add generated by default as identity'), true)
    test.equal(/"?public"?\./.test(first['0001_init.sql'] + next), false)
    // The files run under any search_path
    const {PGlite} = await import('@electric-sql/pglite')
    const {connect} = await import('#/driver/pglite.ts')
    const db = connect(new PGlite())
    await db.run(sql`create schema other`)
    await db.run(sql`set search_path to other`)
    await migrate(db, first)
    await db.insert(Serial).values({})
    await migrate(db, {...first, '0002_identity.sql': next})
    await db.insert(Identity).values({})
    test.equal(await db.select(Identity.id).from(Identity), [1, 2])
    await db.close()
  })

  test('mysql: generate lists every risk of a column', async () => {
    const {generate} = await import('#/mysql/generate.ts')
    const Wide = table('gen_wide', {v: varchar(undefined, {length: 20})})
    const Narrow = table('gen_wide', {
      v: varchar(undefined, {length: 10}).notNull()
    })
    const next = await generate(
      {'0001.sql': await generate({}, {Wide})},
      {Wide: Narrow}
    )
    test.equal(
      next.includes(
        '-- Changes column "v" from varchar(20) to varchar(10)\n' +
          '-- Makes column "v" not null over null values\n'
      ),
      true
    )
  })

  test('mysql: generate leaves out the database name', async () => {
    const {generate} = await import('#/mysql/generate.ts')
    const Parent = table('gen_parent', {
      id: id(),
      code: varchar(undefined, {length: 10}).unique()
    })
    const Child = table('gen_child', {
      code: varchar(undefined, {length: 10}).references(() => Parent.code)
    })
    const Wide = table('gen_parent', {
      id: id(),
      code: varchar(undefined, {length: 20}).unique()
    })
    const first = {'0001_init.sql': await generate({}, {Parent, Child})}
    const next = await generate(first, {Parent: Wide, Child})
    test.equal(next.includes('drop foreign key'), true)
    test.equal(/`[^`]*`\.`/.test(first['0001_init.sql'] + next), false)
  })
}

test('sqlite: generate rebuild comments', async () => {
  const {generate} = await import('#/sqlite/generate.ts')
  const {text: sqliteText, integer: sqliteInteger} = await import('#/sqlite.ts')
  // Only nullability changes, the unique key stays
  const Loose = table('gen_tag', {
    code: sqliteText().unique(),
    note: sqliteText()
  })
  const Strict = table('gen_tag', {
    code: sqliteText().unique(),
    note: sqliteText().notNull().default('x')
  })
  const first = {'0001.sql': await generate({}, {Loose})}
  const strict = await generate(first, {Loose: Strict})
  test.equal(strict.includes('Adds unique key'), false)
  test.equal(strict.includes('sqlite_autoindex'), false)
  // Every risk of the rebuild above its insert
  const Slim = table('gen_tag', {
    code: sqliteText().unique().notNull().default('x')
  })
  const slim = await generate(first, {Loose: Slim})
  test.equal(
    /-- Drops column "note"\n-- Makes column "code" not null over null values\ninsert into/.test(
      slim
    ),
    true
  )
  // A column that becomes the rowid may change it, the shadow can't tell
  const Hidden = table('gen_rowid', {n: sqliteInteger(), v: sqliteText()})
  const Promoted = table('gen_rowid', {
    n: sqliteInteger().primaryKey(),
    v: sqliteText()
  })
  const rowids = await generate(
    {'0001.sql': await generate({}, {Hidden})},
    {Hidden: Promoted}
  )
  test.equal(
    rowids.includes('-- Changes the rowids of "gen_rowid" to "n"'),
    true
  )
  // Dropping the old table cascades where keys stay on
  const P = table('gen_p', {id: sqliteInteger().primaryKey(), v: sqliteText()})
  const C = table('gen_c', {
    p: sqliteInteger().references(() => P.id, {onDelete: 'cascade'})
  })
  const StrictP = table('gen_p', {
    id: sqliteInteger().primaryKey(),
    v: sqliteText().notNull().default('x')
  })
  const cascade = await generate(
    {'0001.sql': await generate({}, {P, C})},
    {P: StrictP, C}
  )
  test.equal(
    cascade.includes(
      '-- Rebuilds "gen_p", deletes rows of "gen_c" where foreign keys stay ' +
        'enforced (D1, Durable Objects)\ndrop table "gen_p";'
    ),
    true
  )
})
