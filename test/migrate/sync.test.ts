import {suite} from '@alinea/suite'
import {table} from '#/index.ts'
import {migrate} from '#/migrate.ts'
import {create as other} from '#/postgres/push.ts'
import {integer} from '#/sqlite.ts'
import {create, drop} from '#/sqlite/push.ts'
import {isBun} from '../TestRuntime.ts'
import {failure} from '../TestUtils.ts'

const test = suite(import.meta)

async function open() {
  if (isBun) {
    const {Database} = await import('bun:sqlite')
    const {connect} = await import('#/driver/bun-sqlite.ts')
    return connect(new Database(':memory:'))
  }
  const {DatabaseSync} = await import('node:sqlite' as string)
  const {connect} = await import('#/driver/node-sqlite.ts')
  return connect(new DatabaseSync(':memory:'))
}

test('migrate returns plain values on a sync driver', async () => {
  const db = await open()
  const files = {'0001_init.sql': 'create table sync_a (id integer);'}
  test.equal(migrate.pending(db, files), ['0001_init'])
  test.equal(migrate(db, files), ['0001_init'])
  test.equal(migrate(db, files), [])
  db.close()
})

test('create and drop return plain values on a sync driver', async () => {
  const db = await open()
  const Parent = table('sync_parent', {id: integer().primaryKey()})
  const Child = table('sync_child', {p: integer().references(Parent.id)})
  test.equal(create(db, {Child, Parent}), undefined)
  test.equal(drop(db, {Child, Parent}), undefined)
  test.equal(
    // @ts-expect-error
    await failure(() => other(db, {Parent})),
    'Expected a postgres database'
  )
  db.close()
})
