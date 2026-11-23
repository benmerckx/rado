import {eq, inArray, notLike} from '../core/expr/Conditions.ts'
import type {Migrator} from '../core/Migrate.ts'
import {Master} from './catalog.ts'
import {unenforced} from './keys.ts'

const master = Master('main', 'sqlite_master')

export const migrator: Migrator = {
  statements: 'Migrations need a driver that runs several statements at once',
  *exists(db, name) {
    const found = yield* db
      .select(master.name)
      .from(master)
      .where(inArray(master.type, ['table', 'view']), eq(master.name, name))
    return found.length > 0
  },
  *empty(db) {
    const found = yield* db
      .select(master.name)
      .from(master)
      .where(notLike(master.name, 'sqlite_%'))
    return found.length === 0
  },
  // Keys are off while the files run, so a rebuilt table doesn't cascade to
  // the rows that reference it. Where they stay on, a rebuild would, unless
  // the database always enforces them and that is documented
  run(db, apply) {
    return unenforced(db, {name: 'Migrations'}, function* (tx, locked) {
      if (locked && !db.driver.enforcesForeignKeys)
        throw new Error('Cannot migrate with foreign keys enforced')
      return yield* apply(tx, false)
    })
  }
}
