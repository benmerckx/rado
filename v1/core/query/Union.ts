import {getData, getQuery, internal, type HasQuery} from '../Internal.ts'
import {Query, QueryData, type QueryMeta} from '../Query.ts'
import {sql, type Sql} from '../Sql.ts'
import type {Select} from './Select.ts'

class UnionData<Meta extends QueryMeta> extends QueryData<Meta> {
  left!: HasQuery
  operator!: Sql
  right!: HasQuery
}

export class Union<Result, Meta extends QueryMeta> extends Query<Result, Meta> {
  readonly [internal.data]: UnionData<Meta>

  constructor(data: UnionData<Meta>) {
    super(data)
    this[internal.data] = data
  }

  union(
    right: Select<Result, Meta> | Union<Result, Meta>
  ): Union<Result, Meta> {
    return new Union<Result, Meta>({
      ...getData(this),
      left: this,
      operator: sql`union`,
      right
    })
  }

  unionAll(right: Select<Result, Meta>): Union<Result, Meta> {
    return new Union<Result, Meta>({
      ...getData(this),
      left: this,
      operator: sql`union all`,
      right
    })
  }

  intersect(right: Select<Result, Meta>): Union<Result, Meta> {
    return new Union<Result, Meta>({
      ...getData(this),
      left: this,
      operator: sql`intersect`,
      right
    })
  }

  except(right: Select<Result, Meta>): Union<Result, Meta> {
    return new Union<Result, Meta>({
      ...getData(this),
      left: this,
      operator: sql`except`,
      right
    })
  }

  get [internal.query]() {
    const {left, operator, right} = getData(this)
    return sql.join([getQuery(left), operator, getQuery(right)])
  }
}
