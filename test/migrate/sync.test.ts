import {suite} from '@alinea/suite'
import {migrate} from '#/migrate.ts'
import {isBun} from '../TestRuntime.ts'

const test = suite(import.meta)

test('migrate returns plain values on a sync driver', async () => {
  const db = isBun
    ? (await import('#/driver/bun-sqlite.ts')).connect(
        new (await import('bun:sqlite')).Database(':memory:')
      )
    : (await import('#/driver/node-sqlite.ts')).connect(
        new (await import('node:sqlite' as string)).DatabaseSync(':memory:')
      )
  const files = {'0001_init.sql': 'create table sync_a (id integer);'}
  test.equal(migrate.pending(db, files), ['0001_init'])
  test.equal(migrate(db, files), ['0001_init'])
  test.equal(migrate(db, files), [])
  db.close()
})
