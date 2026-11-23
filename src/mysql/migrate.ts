import {Column, column} from '../core/Column.ts'
import type {Database} from '../core/Database.ts'
import {eq} from '../core/expr/Conditions.ts'
import type {Migrator} from '../core/Migrate.ts'
import {schema} from '../core/Schema.ts'
import {sql} from '../core/Sql.ts'
import {type Gen, result, transaction} from '../core/Transaction.ts'

// The catalog columns migrate reads, catalog.ts would add all of its own
const text = () => new Column<string>({type: column.text()}).notNull()
const Tables = schema('information_schema').table('tables', {
  table_schema: text(),
  table_name: text()
})

const current = sql<string>`database()`

function* tables(db: Database, name?: string): Gen<Array<string>> {
  return yield* db
    .select(Tables.table_name)
    .from(Tables)
    .where(
      eq(Tables.table_schema, current),
      name ? eq(Tables.table_name, name) : undefined
    )
}

// ER_CANT_CHANGE_TX_CHARACTERISTICS, raised while a transaction is open
function inTransaction(error: unknown): boolean {
  const {errno, cause} = error as {errno?: number; cause?: unknown}
  return errno === 1568 || (cause !== undefined && inTransaction(cause))
}

export const migrator: Migrator = {
  statements: 'Migrations need multipleStatements: true',
  *exists(db, name) {
    return (yield* tables(db, name)).length > 0
  },
  *empty(db) {
    return (yield* tables(db)).length === 0
  },
  // DDL commits implicitly, so each file is recorded as soon as it ran and
  // the transaction only holds one connection for the lock
  *run(db, apply) {
    try {
      // Fails while a transaction is open, else it only sets the default
      yield db.run(sql`set transaction read write`)
    } catch (error) {
      if (!inTransaction(error)) throw error
      throw new Error('Cannot migrate inside a MySQL transaction', {
        cause: error
      })
    }
    // Lock names are server wide, at most 64 characters
    const name = sql`left(concat('rado_migrations.', database()), 64)`
    return yield* result(
      transaction(db, function* (tx) {
        yield tx.run(sql`commit`)
        const [locked] = yield* tx.select(sql<unknown>`get_lock(${name}, -1)`)
        if (Number(locked) !== 1) throw new Error('Cannot lock migrations')
        try {
          return yield* apply(tx, true)
        } finally {
          // The lock goes with the connection anyway, an error here would
          // hide the one that ended the run
          try {
            yield* tx.select(sql`release_lock(${name})`)
          } catch {}
        }
      })
    )
  }
}
