import {Builder} from './Builder.ts'
import type {Dialect} from './Dialect.ts'
import type {Driver} from './Driver.ts'
import {
  getResolver,
  getTable,
  internalResolver,
  type HasQuery,
  type HasResolver,
  type HasSql,
  type HasTable
} from './Internal.ts'
import type {Async, Either, QueryDialect, QueryMeta, Sync} from './MetaData.ts'
import {QueryBatch} from './Query.ts'
import {Resolver, type Batch} from './Resolver.ts'

export class Database<Meta extends QueryMeta = Either>
  extends Builder<Meta>
  implements HasResolver<Meta>
{
  driver: Driver
  dialect: Dialect
  readonly [internalResolver]: Resolver<Meta>
  #transactionDepth: number

  constructor(driver: Driver, dialect: Dialect, transactionDepth = 0) {
    const resolver = new Resolver<Meta>(driver, dialect)
    super({resolver})
    this[internalResolver] = resolver
    this.driver = driver
    this.dialect = dialect
    this.#transactionDepth = transactionDepth
  }

  close(this: Database<Async>): Promise<void>
  close(this: Database<Sync>): void
  close() {
    return this.driver.close()
  }

  [Symbol.dispose](this: Database<Sync>): void {
    this.close()
  }

  async [Symbol.asyncDispose](this: Database<Async>): Promise<void> {
    return this.close()
  }

  create(...tables: Array<HasTable>): QueryBatch<unknown, Meta> {
    return new QueryBatch(
      getResolver(this),
      tables.flatMap(table => getTable(table).create())
    )
  }

  drop(...tables: Array<HasTable>): QueryBatch<unknown, Meta> {
    return new QueryBatch(
      getResolver(this),
      tables.map(table => getTable(table).drop())
    )
  }

  batch<Queries extends Array<HasSql | HasQuery>>(
    queries: Queries
  ): Batch<Meta> {
    const resolver = getResolver(this)
    return resolver.batch(queries)
  }

  execute(this: Database<Sync>, input: HasSql): void
  execute(this: Database<Async>, input: HasSql): Promise<void>
  execute(input: HasSql): void | Promise<void>
  execute(input: HasSql) {
    const emitter = this.dialect.emit(input)
    if (emitter.hasParams) throw new Error('Query has parameters')
    return this.driver.exec(emitter.sql)
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
    return this.driver.transaction(inner => {
      const tx = new Transaction<Meta>(inner, this.dialect)
      return run(tx)
    }, options)
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

export class Rollback<Data = never> extends Error {
  constructor(public data: Data) {
    super('Rollback')
  }
}

export class Transaction<Meta extends QueryMeta> extends Database<Meta> {
  rollback<Data>(data?: Data): never {
    throw new Rollback(data)
  }
}

export class SyncDatabase<Dialect extends QueryDialect> extends Database<
  Sync<Dialect>
> {}
export class AsyncDatabase<Dialect extends QueryDialect> extends Database<
  Async<Dialect>
> {}
