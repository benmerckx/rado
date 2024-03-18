import {HasQuery, getQuery, meta} from '../Meta.ts'
import {Sql, sql} from '../Sql.ts'
import type {Select} from './Select.ts'

class UnionData {
  left!: HasQuery
  operator!: Sql
  right!: HasQuery
}

export class Union<T> implements HasQuery {
  #data: UnionData
  constructor(data: UnionData) {
    this.#data = data
  }

  union(right: Select<T> | Union<T>): Union<T> {
    return new Union<T>({
      left: this,
      operator: sql`union`,
      right
    })
  }

  unionAll(right: Select<T>): Union<T> {
    return new Union<T>({
      left: this,
      operator: sql`union all`,
      right
    })
  }

  intersect(right: Select<T>): Union<T> {
    return new Union<T>({
      left: this,
      operator: sql`intersect`,
      right
    })
  }

  except(right: Select<T>): Union<T> {
    return new Union<T>({
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
