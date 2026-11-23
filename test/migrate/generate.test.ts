import {suite} from '@alinea/suite'
import {type Generate, load} from '#/core/Generate.ts'
import {type Database, table} from '#/index.ts'
import {id, text} from '#/universal.ts'
import {isBun, isDeno} from '../TestRuntime.ts'
import {failure} from '../TestUtils.ts'

const test = suite(import.meta)

const User = table('gen_user', {id: id(), name: text(), bio: text()})
const Renamed = table('gen_user', {id: id(), fullName: text('full_name')})

function testGenerate(
  label: string,
  entry: () => Promise<{generate: Generate<any>}>,
  open: () => Promise<Database<any>>
) {
  test(`${label}: generate`, async () => {
    const {generate} = await entry()
    const shadow = await open()
    const init = await generate({}, {User}, {shadow})
    test.equal(init.startsWith('create table'), true)
    test.equal(init.endsWith(';'), true)
    test.equal(init.includes('"public".'), false)
    // A passed shadow is left open, and is no longer empty
    test.equal(
      await failure(() => generate({}, {User}, {shadow})),
      'Expected an empty database'
    )
    await shadow.driver.close()
    const migrations = {'0001_init.sql': init}
    const rename = {rename: {'gen_user.name': 'full_name'}}
    const next = await generate(migrations, {Renamed}, rename)
    test.equal(next.includes('rename column'), true)
    // MySQL alters the table once, the comment goes above that statement
    test.equal(/-- Drops column "bio"\n[^\n]*drop column/.test(next), true)
    test.equal(
      await generate({...migrations, '0002_next.sql': next}, {Renamed}),
      ''
    )
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
}
