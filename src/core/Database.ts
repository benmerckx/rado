import {Builder} from './Builder.ts'
import type {Dialect} from './Dialect.ts'
import type {Driver} from './Driver.ts'
import {internalResolver, type HasResolver} from './Internal.ts'
import type {Async, Either, QueryDialect, QueryMeta, Sync} from './MetaData.ts'
import type {Query} from './Query.ts'
import {Resolver} from './Resolver.ts'

export class Database<Meta extends QueryMeta = Either>
  extends Builder<Meta>
  implements HasResolver<Meta>
{
  readonly [internalResolver]: Resolver<Meta>
  #driver: Driver
  #dialect: Dialect
  #transactionDepth: number

  constructor(driver: Driver, dialect: Dialect, transactionDepth = 0) {
    const resolver = new Resolver<Meta>(driver, dialect)
    super({resolver})
    this[internalResolver] = resolver
    this.#driver = driver
    this.#dialect = dialect
    this.#transactionDepth = transactionDepth
  }

  close(this: Database<Async>): Promise<void>
  close(this: Database<Sync>): void
  close() {
    return this.#driver.close()
  }

  [Symbol.dispose](this: Database<Sync>): void {
    this.close()
  }

  async [Symbol.asyncDispose](this: Database<Async>): Promise<void> {
    return this.close()
  }

  batch<Queries extends Array<Query<unknown, Meta>>>(
    this: Database<Sync>,
    queries: Queries
  ): Array<unknown>
  batch<Queries extends Array<Query<unknown, Meta>>>(
    this: Database<Async>,
    queries: Queries
  ): Promise<Array<unknown>>
  batch<Queries extends Array<Query<unknown, Meta>>>(queries: Queries) {
    return this.#driver.batch(
      queries.map(query => {
        const compiled = this.#dialect(query)
        return {sql: compiled.sql, params: compiled.bind()}
      }),
      this.#transactionDepth
    )
  }

  transaction<T>(
    this: Database<Sync>,
    run: (tx: Transaction<Meta>) => T,
    options?: TransactionOptions[Meta['dialect']]
  ): T
  transaction<T>(
    this: Database<Async>,
    run: (tx: Transaction<Meta>) => Promise<T>,
    options?: TransactionOptions[Meta['dialect']]
  ): Promise<T>
  transaction<T>(
    run: (tx: Transaction<Meta>) => T | Promise<T>,
    options?: TransactionOptions[Meta['dialect']]
  ): T | Promise<T>
  transaction(run: Function, options = {}) {
    return this.#driver.transaction(
      inner => {
        const tx = new Transaction<Meta>(
          inner,
          this.#dialect,
          this.#transactionDepth + 1
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
  Sync<Dialect>
> {}
export class AsyncDatabase<Dialect extends QueryDialect> extends Database<
  Async<Dialect>
> {}
