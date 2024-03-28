import {Builder} from './Builder.ts'
import type {Driver} from './Driver.ts'
import {
  type HasQuery,
  type HasResolver,
  getSelection,
  hasSelection,
  internal
} from './Internal.ts'
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
  protected transactionDepth = 0
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
      try {
        if (!hasSelection(query) || method === 'run')
          return stmt[method](params)
        const selection = getSelection(query)
        const rows = stmt.values(params)
        const result =
          rows instanceof Promise
            ? rows.then(rows => rows.map(selection.mapRow))
            : rows.map(selection.mapRow)
        if (method === 'all') return result
        return result instanceof Promise
          ? result.then(rows => rows[0])
          : result[0]
      } finally {
        stmt.free()
      }
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
    const tx = new Transaction(this.#driver, this.transactionDepth++)
    return this.#driver.transaction(
      () => run(tx),
      options,
      this.transactionDepth
    )
  }
}

export interface TransactionOptions {
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

export class Rollback extends Error {}

export class Transaction<Meta extends QueryMeta> extends Database<Meta> {
  constructor(driver: Driver<Meta>, depth: number) {
    super(driver)
    this.transactionDepth = depth
  }
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
