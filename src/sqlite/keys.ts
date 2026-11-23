import type {Database} from '../core/Database.ts'
import {sql} from '../core/Sql.ts'
import {table} from '../core/Table.ts'
import {type Gen, within} from '../core/Transaction.ts'
import {integer, text} from './columns.ts'

const Enforced = table('pragma_foreign_keys', {
  foreign_keys: integer().notNull()
})

const Violations = table('pragma_foreign_key_check', {
  table: text().notNull(),
  rowid: integer(),
  parent: text().notNull(),
  fkid: integer().notNull()
})

function* enforced(db: Database): Gen<boolean> {
  const [on] = yield* db.select(Enforced.foreign_keys).from(Enforced)
  return Boolean(on)
}

// A malformed foreign key, anywhere, makes the check itself fail
function* violations(tx: Database, failure: string): Gen<Array<string>> {
  try {
    const rows = yield* tx.select(Violations).from(Violations)
    return rows.map(row => Object.values(row).join())
  } catch (error) {
    throw new Error(`${failure}: ${(error as Error).message}`, {cause: error})
  }
}

export interface Unenforced {
  // Push or Migrations, in the errors
  name: string
  // Rolls back what ran
  dry?: boolean
}

// The foreign_keys pragma is a no-op inside a transaction, where dropping a
// rebuilt table would cascade to the rows that reference it. So keys are
// turned off around the transaction, as SQLite's rebuild procedure has it,
// and checked before commit. An immediate transaction keeps writers out.
// Locked is set when keys stay enforced anyway: inside a caller's
// transaction, or on a database that always enforces them.
export function* unenforced<T>(
  db: Database,
  {name, dry = false}: Unenforced,
  run: (tx: Database, locked: boolean) => Gen<T>
): Gen<T> {
  const on = yield* enforced(db)
  if (on) yield db.run(sql`pragma foreign_keys = off`)
  try {
    return yield* within(
      db,
      function* (tx) {
        const locked = on && (yield* enforced(tx))
        // Checked whether or not keys are enforced, and only what the run
        // breaks fails it, so existing orphans elsewhere don't block it
        const before = yield* violations(tx, 'Cannot check foreign keys')
        const result = yield* run(tx, locked)
        // Counted, rows of a table without rowid can repeat the same key
        for (const key of yield* violations(
          tx,
          `${name} would break a foreign key`
        )) {
          const index = before.indexOf(key)
          if (index < 0)
            throw new Error(`${name} would violate foreign key constraints`)
          before.splice(index, 1)
        }
        return result
      },
      dry,
      {behavior: 'immediate'}
    )
  } finally {
    if (on) yield db.run(sql`pragma foreign_keys = on`)
  }
}
