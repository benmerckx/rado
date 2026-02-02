import {txGenerator} from '../universal.ts'
import {Builder} from './Builder.ts'
import type {Dialect} from './Dialect.ts'
import type {Diff} from './Diff.ts'
import type {Driver} from './Driver.ts'
import {
  type HasCreate,
  type HasDrop,
  type HasQuery,
  type HasResolver,
  type HasValue,
  type HasTarget,
  get,
  internal
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
import {type Sql, sql} from './Sql.ts'
import type {Table} from './Table.ts'
import {count} from './expr/Aggregate.ts'
import type {SelectFirst} from './query/Select.ts'

export class Database<Meta extends QueryMeta = Either>
  extends Builder<Meta>
  implements HasResolver<Meta>
{
  driver: Driver
  dialect: Dialect
  diff: Diff
  readonly [internal]: {resolver: Resolver<Meta>}

  constructor(driver: Driver, dialect: Dialect, diff: Diff) {
    const resolver = new Resolver<Meta>(driver, dialect)
    super({resolver})
    this[internal] = {resolver}
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
    const resolver = get(this).resolver
    const queries = createables.flatMap(entry => get(entry).create ?? [])
    return new BatchQuery(resolver, queries)
  }

  drop(...droppables: Array<HasDrop>): BatchQuery<unknown, Meta> {
    const resolver = get(this).resolver
    const queries = droppables.flatMap(entry => get(entry).drop ?? [])
    return new BatchQuery(resolver, queries)
  }

  run(input: HasValue): Deliver<Meta, void> {
    const sql = this.dialect.inline(input)
    return this.driver.exec(sql) as Deliver<Meta, void>
  }

  get<Result extends Array<unknown>>(
    input: HasQuery<Result>
  ): Deliver<Meta, Result[number]>
  get<Result>(input: HasValue<Result>): Deliver<Meta, Result>
  get(input: HasValue | HasQuery) {
    const emitter = this.dialect.emit(input)
    return this.driver.prepare(emitter.sql).get(emitter.bind())
  }

  all<Result>(input: HasValue<Result>): Deliver<Meta, Array<Result>> {
    const emitter = this.dialect.emit(input)
    return this.driver.prepare(emitter.sql).all(emitter.bind()) as Deliver<
      Meta,
      Array<Result>
    >
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

  batch<Queries extends Array<HasValue | HasQuery>>(
    queries: Queries
  ): BatchQuery<unknown, Meta> {
    return new BatchQuery(get(this).resolver, queries)
  }

  execute(input: HasValue): Deliver<Meta, void>
  execute(input: HasValue) {
    const {value} = get(input)
    const inner = (value ?? (input as any)).inlineValues()
    const emitter = this.dialect.emit(inner)
    if (emitter.hasParams) throw new Error('Query has parameters')
    return this.driver.exec(emitter.sql)
  }

  refreshMaterializedView(view: HasTarget): Deliver<Meta, void> {
    return this.execute(sql`refresh materialized view ${view}`)
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
    source: Table | HasValue,
    condition?: HasValue<boolean>
  ): SelectFirst<Sql<number>, Meta> {
    return this.select(count())
      .from(source as HasValue)
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
