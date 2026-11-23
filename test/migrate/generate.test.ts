import {suite} from '@alinea/suite'
import {type Generate, load} from '#/core/Generate.ts'
import type {QueryDialect, QueryMeta} from '#/core/MetaData.ts'
import {type Database, sql, table} from '#/index.ts'
import {pgSchema} from '#/postgres.ts'
import {id, integer, text} from '#/universal.ts'
import {isBun, isDeno} from '../TestRuntime.ts'
import {failure} from '../TestUtils.ts'

const test = suite(import.meta)

const User = table('gen_user', {id: id(), name: text(), bio: text()})
const Renamed = table('gen_user', {id: id(), fullName: text('full_name')})
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
    const init = await generate(
      {'0000_app.sql': 'create schema gen_app;'},
      {User, Note, Archive}
    )
    const literal = `'see "public".x'`
    test.equal(init.includes(literal), true)
    test.equal(init.replace(literal, '').includes('"public".'), false)
    test.equal(init.includes('"gen_app"."gen_archive"'), true)
  })
}
