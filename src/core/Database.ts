import {Builder} from './Builder.ts'
import type {Dialect} from './Dialect.ts'
import type {Driver} from './Driver.ts'
import {count} from './expr/Aggregate.ts'
import {
  type HasCreate,
  type HasDrop,
  type HasQuery,
  type HasResolver,
  type HasSql,
  type HasTarget,
  getCreate,
  getDrop,
  getResolver,
  hasCreate,
  hasDrop,
  hasQuery,
  hasSelection,
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
import {type Schema, members} from './Order.ts'
import {BatchQuery, type SingleQuery} from './Queries.ts'
import type {SelectFirst} from './query/Select.ts'
import {Resolver} from './Resolver.ts'
import {Rollback} from './Rollback.ts'
import {type Sql, sql} from './Sql.ts'
import type {Table} from './Table.ts'

export interface QueryLog {
  sql: string
  params: Array<unknown>
}

export interface DatabaseOptions {
  logQuery?: (query: QueryLog, durationMs: number) => void
}

export class Database<Meta extends QueryMeta = Either>
  extends Builder<Meta>
  implements HasResolver<Meta>
{
  driver: Driver
  dialect: Dialect
  options: DatabaseOptions
  readonly [internalResolver]: Resolver<Meta>

  constructor(driver: Driver, dialect: Dialect, options: DatabaseOptions = {}) {
    const resolver = new Resolver<Meta>(driver, dialect, options)
    super({resolver})
    this[internalResolver] = resolver
    this.driver = driver
    this.dialect = dialect
    this.options = options
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

  create(...input: Array<HasCreate | Schema>): BatchQuery<unknown, Meta> {
    const queries = members(input, hasCreate).flatMap(getCreate)
    return new BatchQuery(getResolver(this), queries)
  }

  drop(...input: Array<HasDrop | Schema>): BatchQuery<unknown, Meta> {
    const queries = members(input, hasDrop).toReversed().flatMap(getDrop)
    return new BatchQuery(getResolver(this), queries)
  }

  run(input: HasSql): Deliver<Meta, void> {
    const sql = this.dialect.inline(input)
    return this[internalResolver].exec(sql) as Deliver<Meta, void>
  }

  get<Result extends Array<unknown>>(
    input: HasQuery<Result>
  ): Deliver<Meta, Result[number] | null>
  get<Result>(input: HasSql<Result>): Deliver<Meta, Result | null>
  get(input: HasSql | HasQuery) {
    return this[internalResolver].get(input)
  }

  all<Result>(input: HasSql<Result>): Deliver<Meta, Array<Result>> {
    return this[internalResolver].all(input) as Deliver<Meta, Array<Result>>
  }

  batch<Queries extends Array<HasSql | HasQuery>>(
    queries: Queries
  ): BatchQuery<unknown, Meta> {
    return new BatchQuery(getResolver(this), queries)
  }

  execute<Result>(input: HasQuery<Result>): Deliver<Meta, Result>
  execute<Result>(input: HasSql<Result>): Deliver<Meta, [Array<Result>]>
  execute(input: HasSql | HasQuery) {
    if (hasQuery(input)) {
      const query = input as SingleQuery<unknown, Meta>
      return hasSelection(input)
        ? (query as SingleQuery<Array<unknown>, Meta>).all(this)
        : query.run(this)
    }

    const result = this[internalResolver].all(input, {isSelection: true})
    if (result instanceof Promise) return result.then(rows => [rows])
    return [result]
  }

  refreshMaterializedView(view: HasTarget): Deliver<Meta, void> {
    return this.run(sql`refresh materialized view ${view}`)
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
        const tx = new Transaction<Meta>(inner, this.dialect, this.options)
        return run(tx)
      },
      {async: run.constructor.name === 'AsyncFunction', ...options}
    )
  }

  $count(
    source: Table | HasSql,
    condition?: HasSql<boolean>
  ): SelectFirst<Sql<number>, Meta> {
    return this.select(count())
      .from(source as HasSql)
      .where(condition)
      .$first()
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

export {Rollback}

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
