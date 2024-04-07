import {Builder} from './Builder.ts'
import type {Dialect} from './Dialect.ts'
import type {Driver} from './Driver.ts'
import {
  type HasQuery,
  type HasResolver,
  getSelection,
  hasSelection,
  internalResolver
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
  readonly [internalResolver]: QueryResolver<Meta['mode']>
  #driver: Driver<Meta>
  #dialect: Dialect
  #transactionDepth: number

  constructor(driver: Driver<Meta>, dialect: Dialect, transactionDepth = 0) {
    const resolver = {
      all: exec.bind(null, 'all'),
      get: exec.bind(null, 'get'),
      run: exec.bind(null, 'run')
    }
    super({resolver})
    this[internalResolver] = resolver
    this.#driver = driver
    this.#dialect = dialect
    this.#transactionDepth = transactionDepth

    function exec(method: 'all' | 'get' | 'run', query: HasQuery) {
      const {sql, params} = dialect(query)
      const stmt = driver.prepare(sql)
      const isSelection = hasSelection(query) && method !== 'run'
      const mapRow = isSelection ? getSelection(query).mapRow : undefined
      const singleResult = method === 'get'
      const transform = (rows: Array<unknown>) => {
        const mappedRows: Array<unknown> = mapRow
          ? (<Array<Array<unknown>>>rows).map(mapRow)
          : rows
        return singleResult ? mappedRows[0] : mappedRows
      }
      const rows = isSelection ? stmt.values(params) : stmt[method](params)
      if (rows instanceof Promise)
        return rows.then(transform).finally(stmt.free.bind(stmt))
      try {
        return transform(<Array<unknown>>rows)
      } finally {
        stmt.free()
      }
    }
  }

  close() {
    return this.#driver.close()
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
    return this.#driver.transaction(
      inner => {
        const tx = new Transaction<Meta>(
          <Driver<Meta>>inner,
          this.#dialect,
          this.#transactionDepth++
        )
        return run(tx)
      },
      options,
      this.#transactionDepth
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
