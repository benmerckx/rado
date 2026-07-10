import {txGenerator} from '../universal.ts'
import {Builder} from './Builder.ts'
import type {Dialect} from './Dialect.ts'
import type {Diff} from './Diff.ts'
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
  getSql,
  hasQuery,
  internalResolver
} from './Internal.ts'
import type {
  Async,
  Deliver,
  Either,
  MutationResult,
  QueryDialect,
  QueryMeta,
  Sync
} from './MetaData.ts'
import {BatchQuery, type SingleQuery} from './Queries.ts'
import type {SelectFirst} from './query/Select.ts'
import {Resolver} from './Resolver.ts'
import {type Sql, sql} from './Sql.ts'
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

  create(...createables: Array<HasCreate>): BatchQuery<unknown, Meta> {
    return new BatchQuery(getResolver(this), createables.flatMap(getCreate))
  }

  drop(...droppables: Array<HasDrop>): BatchQuery<unknown, Meta> {
    return new BatchQuery(getResolver(this), droppables.flatMap(getDrop))
  }

  run(input: HasSql): Deliver<Meta, void> {
    const sql = this.dialect.inline(input)
    return this.driver.exec(sql) as Deliver<Meta, void>
  }

  get<Result extends Array<unknown>>(
    input: HasQuery<Result>
  ): Deliver<Meta, Result[number]>
  get<Result>(input: HasSql<Result>): Deliver<Meta, Result>
  get(input: HasSql | HasQuery) {
    const emitter = this.dialect.emit(input)
    return this.driver.prepare(emitter.sql).get(emitter.bind())
  }

  all<Result>(input: HasSql<Result>): Deliver<Meta, Array<Result>> {
    const emitter = this.dialect.emit(input)
    return this.driver.prepare(emitter.sql).all(emitter.bind()) as Deliver<
      Meta,
      Array<Result>
    >
  }

  migrate(...tables: Array<Table>): Deliver<Meta, void> {
    if (this.dialect.runtime === 'mysql' && tables.length > 1) {
      const run = async () => {
        for (const table of tables) await this.migrate(table)
      }
      return run() as Deliver<Meta, void>
    }
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

  execute<Result>(input: HasSql<Result>): Deliver<Meta, [Array<Result>]>
  execute<Result>(input: HasQuery<Result>): Deliver<Meta, MutationResult<Meta>>
  execute(input: HasSql | HasQuery) {
    if (hasQuery(input)) return (input as SingleQuery<unknown, Meta>).run(this)

    const emitter = this.dialect.emit(input)
    const statement = this.driver.prepare(emitter.sql, {isSelection: true})
    try {
      const result = statement.all(emitter.bind())
      if (result instanceof Promise)
        return result
          .then(rows => [rows])
          .finally(statement.free.bind(statement))
      statement.free()
      return [result]
    } catch (error) {
      statement.free()
      throw error
    }
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
        const tx = new Transaction<Meta>(inner, this.dialect, this.diff)
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
