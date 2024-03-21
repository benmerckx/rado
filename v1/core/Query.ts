import {
  getResolver,
  internal,
  type HasQuery,
  type HasResolver
} from './Internal.ts'
import type {Sql} from './Sql.ts'

export type QueryMode = 'sync' | 'async' | undefined
export type QueryDialect = 'universal' | 'sqlite' | 'mysql' | 'postgres'
export interface QueryMeta {
  mode: QueryMode
  dialect: QueryDialect
}
export interface SyncQuery<Dialect extends QueryDialect = QueryDialect>
  extends QueryMeta {
  mode: 'sync'
  dialect: Dialect
}
export interface AsyncQuery<Dialect extends QueryDialect = QueryDialect>
  extends QueryMeta {
  mode: 'async'
  dialect: Dialect
}

export declare class QueryResolver<Mode extends QueryMode = QueryMode> {
  #mode?: Mode
  all(query: HasQuery): unknown
  get(query: HasQuery): unknown
  run(query: HasQuery): unknown
}

export class QueryData<Meta extends QueryMeta> {
  resolver?: QueryResolver<Meta['mode']>
}

export abstract class Query<Result, Meta extends QueryMeta>
  implements HasQuery, PromiseLike<Array<Result>>
{
  readonly [internal.data]: QueryData<Meta>;
  abstract [internal.query]: Sql

  constructor(data: QueryData<Meta>) {
    this[internal.data] = data
  }

  all(this: Query<Result, SyncQuery>): Array<Result>
  all(this: Query<Result, AsyncQuery>): Promise<Array<Result>>
  all(db: HasResolver<'sync'>): Array<Result>
  all(db: HasResolver<'async'>): Promise<Array<Result>>
  all(db?: HasResolver) {
    return (db ? getResolver(db) : this[internal.data].resolver)!.all(this)
  }

  get(this: Query<Result, SyncQuery>): Result
  get(this: Query<Result, AsyncQuery>): Promise<Result>
  get(db: HasResolver<'sync'>): Result
  get(db: HasResolver<'async'>): Promise<Result>
  get(db?: HasResolver) {
    return (db ? getResolver(db) : this[internal.data].resolver)!.get(this)
  }

  run(this: Query<unknown, SyncQuery>): void
  run(this: Query<unknown, AsyncQuery>): Promise<void>
  run(db: HasResolver<'sync'>): void
  run(db: HasResolver<'async'>): Promise<void>
  run(db?: HasResolver) {
    return (db ? getResolver(db) : this[internal.data].resolver)!.run(this)
  }

  // biome-ignore lint/suspicious/noThenProperty:
  then<TResult1 = Array<Result>, TResult2 = never>(
    this: Query<Result, AsyncQuery>,
    onfulfilled?:
      | ((value: Array<Result>) => TResult1 | PromiseLike<TResult1>)
      | undefined
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | undefined
      | null
  ): Promise<TResult1 | TResult2> {
    return this.all().then(onfulfilled, onrejected)
  }

  catch<TResult = never>(
    this: Query<Result, AsyncQuery>,
    onrejected?:
      | ((reason: unknown) => TResult | PromiseLike<TResult>)
      | undefined
      | null
  ): Promise<Array<Result> | TResult> {
    return this.all().catch(onrejected)
  }

  finally(
    this: Query<Result, AsyncQuery>,
    onfinally?: (() => void) | undefined | null
  ): Promise<Array<Result>> {
    return this.all().finally(onfinally)
  }
}
