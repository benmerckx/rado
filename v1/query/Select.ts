import type {Expr} from '../Expr.ts'
import {
  Is,
  getQuery,
  getSql,
  getTable,
  isTable,
  type IsQuery,
  type IsSql,
  type IsTable
} from '../Is.ts'
import {Query} from '../Query.ts'
import {sql} from '../Sql.ts'
import type {Table} from '../Table.ts'
import {Union} from './Union.ts'

class SelectData {
  select?: IsSql
  from?: IsQuery | IsTable
  subject?: IsSql
  where?: IsSql
  groupBy?: IsSql
  having?: IsSql
  orderBy?: IsSql
  limit?: IsSql
}

export class Select<T> implements IsQuery {
  readonly [Is.query]: Query

  #data: SelectData
  constructor(data: SelectData = {}) {
    this.#data = data
    this[Is.query] = new Query(this)
  }

  select<T>(select: Expr<T>): Select<T> {
    return new Select<T>({...this.#data, select: select})
  }

  from<Row>(from: IsQuery | Table<Row>): Select<Row> {
    return new Select<T>({...this.#data, from})
  }

  selectDistinct(select: Expr<T>): Select<T> {
    return new Select<T>({...this.#data, select: sql`distinct ${select}`})
  }

  where(where: Expr<boolean>) {
    return new Select<T>({...this.#data, where})
  }

  having(having: Expr<boolean>) {
    return new Select<T>({...this.#data, having})
  }

  groupBy(...exprs: Array<Expr>) {
    return new Select<T>({
      ...this.#data,
      groupBy: sql.join(exprs, sql.unsafe(', '))
    })
  }

  orderBy(...exprs: Array<Expr>) {
    return new Select<T>({
      ...this.#data,
      orderBy: sql.join(exprs, sql.unsafe(', '))
    })
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
    const parts: Array<IsSql> = []
    const {select, from, where, groupBy, having, orderBy, limit} = this.#data
    const selection = !select
      ? isTable(from)
        ? getTable(from).selectColumns()
        : sql`*`
      : select
    parts.push(sql`select ${selection}`)
    if (from) {
      const target = isTable(from)
        ? sql.identifier(getTable(from).name)
        : getQuery(from).toSubquery()
      parts.push(sql`from ${target}`)
    }
    if (where) parts.push(sql`where ${where}`)
    if (groupBy) parts.push(sql`group by ${groupBy}`)
    if (having) parts.push(sql`having ${having}`)
    if (orderBy) parts.push(sql`order by ${orderBy}`)
    if (limit) parts.push(sql`limit ${limit}`)
    return getSql(sql.join(parts))
  }
}
