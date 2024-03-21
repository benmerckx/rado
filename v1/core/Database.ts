import {Builder} from './Builder.ts'
import type {Driver} from './Driver.ts'
import {internal, type HasQuery, type HasResolver} from './Internal.ts'
import type {
  AsyncQuery,
  QueryDialect,
  QueryMeta,
  QueryResolver,
  SyncQuery
} from './Query.ts'

export class Database<Meta extends QueryMeta>
  extends Builder<Meta>
  implements HasResolver<Meta['mode']>
{
  readonly [internal.resolver]: QueryResolver<Meta['mode']>
  #driver: Driver<Meta>

  constructor(driver: Driver<Meta>) {
    const resolver = {
      all: exec.bind(null, 'all'),
      get: exec.bind(null, 'get'),
      run: exec.bind(null, 'run')
    }
    super({resolver})
    this[internal.resolver] = resolver
    this.#driver = driver

    function exec(method: 'all' | 'get' | 'run', query: HasQuery) {
      const [sql, params] = driver.emitter.emit(query)
      const stmt = driver.prepare(sql)
      const res = stmt[method](params)
      stmt.free()
      return res
    }
  }

  transaction<T>(
    this: Database<SyncQuery>,
    run: (tx: Transaction<Meta>) => T,
    options?: TransactionOptions[Meta['dialect']]
  ): T
  transaction<T>(
    this: Database<AsyncQuery>,
    run: (tx: Transaction<Meta>) => Promise<T>,
    options?: TransactionOptions[Meta['dialect']]
  ): Promise<T>
  transaction(run: Function, options = {}) {
    const tx = new Transaction(this.#driver)
    return undefined!
  }
}

interface TransactionOptions {
  universal: never
  sqlite: {
    behavior?: 'deferred' | 'immediate' | 'exclusive'
  }
  postgres: {
    isolationLevel?:
      | 'read uncommitted'
      | 'read committed'
      | 'repeatable read'
      | 'serializable'
    accessMode?: 'read only' | 'read write'
    deferrable?: boolean
  }
  mysql: {
    isolationLevel?:
      | 'read uncommitted'
      | 'read committed'
      | 'repeatable read'
      | 'serializable'
    accessMode?: 'read only' | 'read write'
    withConsistentSnapshot?: boolean
  }
}

class Rollback extends Error {}

class Transaction<Meta extends QueryMeta> extends Database<Meta> {
  rollback(): never {
    throw new Rollback('Rollback')
  }
}

export class SyncDatabase<Dialect extends QueryDialect> extends Database<
  SyncQuery<Dialect>
> {}
export class AsyncDatabase<Dialect extends QueryDialect> extends Database<
  AsyncQuery<Dialect>
> {}
