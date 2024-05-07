import {Builder} from './Builder.ts'
import type {Dialect} from './Dialect.ts'
import type {Driver} from './Driver.ts'
import {internalResolver, type HasResolver} from './Internal.ts'
import type {Async, Either, QueryDialect, QueryMeta, Sync} from './MetaData.ts'
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

  transact<T>(
    gen: (tx: Transaction<Meta>) => Generator<Promise<unknown>, T>,
    options?: TransactionOptions[Meta['dialect']]
  ): Promise<T> {
    return (<Database<any>>this).transaction(async (tx: Transaction<Meta>) => {
      const iter = gen(tx)
      let current: IteratorResult<Promise<unknown>>
      while ((current = iter.next(tx))) {
        if (current.done) return current.value
        await current.value
      }
    }, options)
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
  transaction(run: Function, options = {}) {
    return this.#driver.transaction(
      inner => {
        const tx = new Transaction<Meta>(
          inner,
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
  Sync<Dialect>
> {}
export class AsyncDatabase<Dialect extends QueryDialect> extends Database<
  Async<Dialect>
> {}
