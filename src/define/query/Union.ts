import {Query, QueryData} from '../Query'
import {SelectMultiple} from './Select'

export class Union<Row> extends Query<Array<Row>> {
  declare [Query.Data]: QueryData.Union | QueryData.Select

  constructor(query: QueryData.Union | QueryData.Select) {
    super(query)
  }

  union(query: SelectMultiple<Row> | Union<Row>): Union<Row> {
    return new Union(
      new QueryData.Union({
        a: this[Query.Data],
        operator: QueryData.UnionOperation.Union,
        b: query[Query.Data]
      })
    )
  }

  unionAll(query: SelectMultiple<Row> | Union<Row>): Union<Row> {
    return new Union(
      new QueryData.Union({
        a: this[Query.Data],
        operator: QueryData.UnionOperation.UnionAll,
        b: query[Query.Data]
      })
    )
  }

  except(query: SelectMultiple<Row> | Union<Row>): Union<Row> {
    return new Union(
      new QueryData.Union({
        a: this[Query.Data],
        operator: QueryData.UnionOperation.Except,
        b: query[Query.Data]
      })
    )
  }

  intersect(query: SelectMultiple<Row> | Union<Row>): Union<Row> {
    return new Union(
      new QueryData.Union({
        a: this[Query.Data],
        operator: QueryData.UnionOperation.Intersect,
        b: query[Query.Data]
      })
    )
  }
}
