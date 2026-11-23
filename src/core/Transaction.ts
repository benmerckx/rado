import {run} from '../universal/transactions.ts'
import type {Database, TransactionOptions} from './Database.ts'
import {Rollback} from './Rollback.ts'
import type {QueryDialect} from './MetaData.ts'

// Yields queries, or their promises on an async driver, so the same code
// runs on sync and async drivers
export type Gen<T> = Generator<unknown, T, unknown>

type Options = TransactionOptions[QueryDialect]

export function exec<T>(gen: Gen<T>): T | Promise<T> {
  return run(gen, value => value)
}

// The value of a call that returns it directly or as a promise
export function* result<T>(value: T | Promise<T>): Gen<T> {
  return (yield value) as T
}

export function transaction<T>(
  db: Database,
  inner: (tx: Database) => Gen<T>,
  options?: Options
): T | Promise<T> {
  return db.transaction(tx => exec(inner(tx)), options)
}

// Runs inside a transaction or savepoint that is always rolled back
export function* scratch<T>(
  db: Database,
  inner: (tx: Database) => Gen<T>,
  options?: Options
): Gen<T> {
  try {
    yield transaction(
      db,
      function* (tx) {
        throw new Rollback(yield* inner(tx))
      },
      options
    )
  } catch (error) {
    if (error instanceof Rollback) return error.data as T
    throw error
  }
  throw new Error('Expected a rollback')
}

// A dry run applies everything and rolls it back
export function* within<T>(
  db: Database,
  inner: (tx: Database) => Gen<T>,
  dry: boolean,
  options?: Options
): Gen<T> {
  if (dry) return yield* scratch(db, inner, options)
  return yield* result(transaction(db, inner, options))
}
