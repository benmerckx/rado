import {Query, QueryData} from '../Query.js'

export class Batch<T = void> extends Query<T> {
  declare [Query.Data]: QueryData.Batch

  constructor(protected queries: Array<QueryData>) {
    super(new QueryData.Batch({queries}))
  }

  next<T>(cursor: Query<T>): Query<T> {
    return new Query<T>(
      new QueryData.Batch({
        queries: [...this[Query.Data].queries, cursor[Query.Data]]
      })
    )
  }
}
