import {txGenerator} from '../universal.ts'
import {Builder} from './Builder.ts'
import type {Dialect} from './Dialect.ts'
import type {Diff} from './Diff.ts'
import type {Driver} from './Driver.ts'
import {
  type HasQuery,
  type HasResolver,
  type HasSql,
  type HasTable,
  getResolver,
  getTable,
  internalResolver
} from './Internal.ts'
import type {
  Async,
  Deliver,
  Either,
  QueryDialect,
  QueryMeta,
  Sync
} from './MetaData.ts'
import {BatchQuery} from './Queries.ts'
import {Resolver} from './Resolver.ts'
import {sql} from './Sql.ts'
import type {Table} from './Table.ts'

export class Database<Meta extends QueryMeta = Either>
  extends Builder<Meta>
  implements HasResolver<Meta>
{
  driver: Driver
  dialect: Dialect
  diff: Diff
  readonly [internalResolver]: Resolver<Meta>

  constructor(driver: Driver, dialect: Dialect, diff: Diff) {
    const resolver = new Resolver<Meta>(driver, dialect)
    super({resolver})
    this[internalResolver] = resolver
    this.driver = driver
    this.dialect = dialect
    this.diff = diff
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

  create(...tables: Array<HasTable>): BatchQuery<unknown, Meta> {
    return new BatchQuery(
      getResolver(this),
      tables.flatMap(table => getTable(table).create())
    )
  }

  drop(...tables: Array<HasTable>): BatchQuery<unknown, Meta> {
    return new BatchQuery(
      getResolver(this),
      tables.map(table => getTable(table).drop())
    )
  }

  migrate(...tables: Array<Table>): Deliver<Meta, void> {
    const computeDiff = this.diff
    return this.transaction<void>(
      txGenerator(function* (tx) {
        for (const table of tables) {
          const diff = yield* computeDiff(table)
          if (diff.length > 0) yield* tx.batch(diff.map(sql.unsafe))
        }
      })
    )
  }

  batch<Queries extends Array<HasSql | HasQuery>>(
    queries: Queries
  ): BatchQuery<unknown, Meta> {
    return new BatchQuery(getResolver(this), queries)
  }

  execute(input: HasSql): Deliver<Meta, void>
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
  ): Deliver<Meta, T>
  transaction(run: Function, options = {}) {
    return this.driver.transaction(
      inner => {
        const tx = new Transaction<Meta>(inner, this.dialect, this.diff)
        return run(tx)
      },
      {async: run.constructor.name === 'AsyncFunction', ...options}
    )
  }
}

export interface TransactionUniversalOptions {
  async?: boolean
}

export interface TransactionOptions {
  universal: TransactionUniversalOptions
  sqlite: TransactionUniversalOptions & {
    behavior?: 'deferred' | 'immediate' | 'exclusive'
  }
  postgres: TransactionUniversalOptions & {
    isolationLevel?:
      | 'read uncommitted'
      | 'read committed'
      | 'repeatable read'
      | 'serializable'
    accessMode?: 'read only' | 'read write'
    deferrable?: boolean
  }
  mysql: TransactionUniversalOptions & {
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
