import {
  getResolver,
  internal,
  type HasQuery,
  type HasResolver
} from './Internal.ts'
import type {Sql} from './Sql.ts'

export type QueryMode = 'sync' | 'async' | undefined

declare const mode: unique symbol
export interface QueryResolver<Mode extends QueryMode = QueryMode> {
  [mode]?: Mode
  all(query: HasQuery): unknown
  get(query: HasQuery): unknown
  run(query: HasQuery): unknown
}

export class QueryData<Mode extends QueryMode> {
  resolver?: QueryResolver<Mode>
}

export abstract class Query<Result, Mode extends QueryMode>
  implements HasQuery
{
  readonly [internal.data]: QueryData<Mode>;
  abstract [internal.query]: Sql

  constructor(data: QueryData<Mode>) {
    this[internal.data] = data
  }

  all(this: Query<Result, 'sync'>): Array<Result>
  all(this: Query<Result, 'async'>): Promise<Array<Result>>
  all(db: HasResolver<'sync'>): Array<Result>
  all(db: HasResolver<'async'>): Promise<Array<Result>>
  all(db?: HasResolver) {
    return (db ? getResolver(db) : this[internal.data].resolver)!.all(this)
  }

  get(this: Query<Result, 'sync'>): Result
  get(this: Query<Result, 'async'>): Promise<Result>
  get(db: HasResolver<'sync'>): Result
  get(db: HasResolver<'async'>): Promise<Result>
  get(db?: HasResolver) {
    return (db ? getResolver(db) : this[internal.data].resolver)!.get(this)
  }

  run(this: Query<unknown, 'sync'>): void
  run(this: Query<unknown, 'async'>): Promise<void>
  run(db: HasResolver<'sync'>): void
  run(db: HasResolver<'async'>): Promise<void>
  run(db?: HasResolver) {
    return (db ? getResolver(db) : this[internal.data].resolver)!.run(this)
  }
}
