import {getData, getQuery, internal, type HasQuery} from '../Internal.ts'
import {Query, QueryData, type QueryMode} from '../Query.ts'
import {sql, type Sql} from '../Sql.ts'
import type {Select} from './Select.ts'

class UnionData<Mode extends QueryMode> extends QueryData<Mode> {
  left!: HasQuery
  operator!: Sql
  right!: HasQuery
}

export class Union<Result, Mode extends QueryMode> extends Query<Result, Mode> {
  readonly [internal.data]: UnionData<Mode>

  constructor(data: UnionData<Mode>) {
    super(data)
    this[internal.data] = data
  }

  union(
    right: Select<Result, Mode> | Union<Result, Mode>
  ): Union<Result, Mode> {
    return new Union<Result, Mode>({
      ...getData(this),
      left: this,
      operator: sql`union`,
      right
    })
  }

  unionAll(right: Select<Result, Mode>): Union<Result, Mode> {
    return new Union<Result, Mode>({
      ...getData(this),
      left: this,
      operator: sql`union all`,
      right
    })
  }

  intersect(right: Select<Result, Mode>): Union<Result, Mode> {
    return new Union<Result, Mode>({
      ...getData(this),
      left: this,
      operator: sql`intersect`,
      right
    })
  }

  except(right: Select<Result, Mode>): Union<Result, Mode> {
    return new Union<Result, Mode>({
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
