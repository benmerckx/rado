import {getQuery, meta, type HasQuery} from '../Meta.ts'
import {Query, QueryData, QueryMode} from '../Query.ts'
import {sql, type Sql} from '../Sql.ts'
import type {Select} from './Select.ts'

class UnionData extends QueryData {
  left!: HasQuery
  operator!: Sql
  right!: HasQuery
}

export class Union<Result, Mode extends QueryMode> extends Query<Result, Mode> {
  #data: UnionData
  constructor(data: UnionData) {
    super(data)
    this.#data = data
  }

  union(
    right: Select<Result, Mode> | Union<Result, Mode>
  ): Union<Result, Mode> {
    return new Union<Result, Mode>({
      ...this.#data,
      left: this,
      operator: sql`union`,
      right
    })
  }

  unionAll(right: Select<Result, Mode>): Union<Result, Mode> {
    return new Union<Result, Mode>({
      ...this.#data,
      left: this,
      operator: sql`union all`,
      right
    })
  }

  intersect(right: Select<Result, Mode>): Union<Result, Mode> {
    return new Union<Result, Mode>({
      ...this.#data,
      left: this,
      operator: sql`intersect`,
      right
    })
  }

  except(right: Select<Result, Mode>): Union<Result, Mode> {
    return new Union<Result, Mode>({
      ...this.#data,
      left: this,
      operator: sql`except`,
      right
    })
  }

  get [meta.query]() {
    const {left, operator, right} = this.#data
    return sql.join([getQuery(left), operator, getQuery(right)])
  }
}
