import {Is, getSql, type IsQuery, type IsSql} from '../Is.ts'
import {Query} from '../Query.ts'
import {sql} from '../Sql.ts'
import type {Select} from './Select.ts'

class UnionData {
  left!: IsQuery
  operator!: IsSql
  right!: IsQuery
}

export class Union<T> implements IsQuery {
  readonly [Is.query]: Query

  #data: UnionData
  constructor(data: UnionData) {
    this.#data = data
    this[Is.query] = new Query(this)
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

  get [Is.sql]() {
    const {left, operator, right} = this.#data
    return getSql(sql.join([left, operator, right]))
  }
}
