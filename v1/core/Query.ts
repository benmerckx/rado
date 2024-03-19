import {HasQuery, meta} from './Meta.ts'
import {Sql} from './Sql.ts'

export type QueryMode = 'sync' | 'async' | undefined

export interface QueryResolver {
  all(query: HasQuery): unknown
  get(query: HasQuery): unknown
  run(query: HasQuery): unknown
}

export class QueryData {
  resolver?: QueryResolver
}

export abstract class Query<Result, Mode extends QueryMode>
  implements HasQuery
{
  #result?: Result
  #mode?: Mode;
  abstract [meta.query]: Sql
  #data: QueryData
  constructor(data: QueryData) {
    this.#data = data
  }

  all<Result>(this: Query<Result, 'sync'>): Result
  all<Result>(this: Query<Result, 'async'>): Promise<Result>
  all<Result>(this: Query<Result, QueryMode>) {
    return this.#data.resolver!.all(this)
  }

  get<Result>(this: Query<Result, 'sync'>): Result
  get<Result>(this: Query<Result, 'async'>): Promise<Result>
  get<Result>(this: Query<Result, QueryMode>) {
    return this.#data.resolver!.get(this)
  }

  run(this: Query<unknown, 'sync'>): void
  run(this: Query<unknown, 'async'>): Promise<void>
  run(this: Query<unknown, QueryMode>) {
    return this.#data.resolver!.run(this)
  }
}
