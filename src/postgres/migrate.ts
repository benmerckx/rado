import {and, eq, inArray, ne, notLike} from '../core/expr/Conditions.ts'
import type {Migrator} from '../core/Migrate.ts'
import {sql} from '../core/Sql.ts'
import {result, transaction} from '../core/Transaction.ts'
import {Class, Namespace, Type} from './catalog.ts'

// Pins the lock to migrations, the key is "rado" in ascii
const key = 0x7261646f

const current = sql<string>`current_schema()`
const own = and(
  notLike(Namespace.nspname, 'pg\\_%'),
  ne(Namespace.nspname, 'information_schema')
)

export const migrator: Migrator = {
  statements:
    'Migrate over the websocket Pool, Neon HTTP runs one statement per query',
  *exists(db, name) {
    const found = yield* db
      .select(Class.relname)
      .from(Class)
      .innerJoin(Namespace, eq(Namespace.oid, Class.relnamespace))
      .where(eq(Namespace.nspname, current), eq(Class.relname, name))
    return found.length > 0
  },
  // Schemas besides public, relations of any kind and types of their own
  *empty(db) {
    const schemas = yield* db
      .select(Namespace.nspname)
      .from(Namespace)
      .where(own, ne(Namespace.nspname, 'public'))
    const relations = yield* db
      .select(Class.relname)
      .from(Class)
      .innerJoin(Namespace, eq(Namespace.oid, Class.relnamespace))
      .where(own)
    const types = yield* db
      .select(Type.typname)
      .from(Type)
      .innerJoin(Namespace, eq(Namespace.oid, Type.typnamespace))
      .where(own, inArray(Type.typtype, ['e', 'd', 'r', 'm']))
    return schemas.length + relations.length + types.length === 0
  },
  *run(db, apply) {
    return yield* result(
      transaction(db, function* (tx) {
        yield* tx.select(sql`pg_advisory_xact_lock(${sql.inline(key)})`)
        return yield* apply(tx, false)
      })
    )
  }
}
