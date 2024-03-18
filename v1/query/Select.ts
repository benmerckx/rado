import type {Expr} from '../Expr.ts'
import {
  HasExpr,
  HasQuery,
  HasSelection,
  HasTable,
  getQuery,
  getSelection,
  getTable,
  hasTable,
  meta
} from '../Meta.ts'
import {Selection, SelectionInput} from '../Selection.ts'
import {Sql, sql} from '../Sql.ts'
import type {Table, TableDefinition, TableRow} from '../Table.ts'
import {Union} from './Union.ts'

class SelectData {
  selection?: SelectionInput
  distinct?: boolean
  from?: HasQuery | HasTable
  subject?: Sql
  where?: HasExpr
  groupBy?: Sql
  having?: HasExpr
  orderBy?: Sql
  limit?: Sql
}

export class Select<T> implements HasQuery, HasSelection {
  #data: SelectData
  constructor(data: SelectData = {}) {
    this.#data = data
  }

  select<T>(selection: SelectionInput): Select<T> {
    return new Select<T>({...this.#data, selection})
  }

  from<Definition extends TableDefinition>(
    from: Table<Definition>
  ): Select<TableRow<Definition>>
  from(from: HasQuery): Select<unknown>
  from(from: HasQuery | Table) {
    return new Select<T>({...this.#data, from})
  }

  selectDistinct(selection: SelectionInput): Select<T> {
    return new Select<T>({...this.#data, selection})
  }

  where(where: Expr<boolean>) {
    return new Select<T>({...this.#data, where})
  }

  groupBy(...exprs: Array<Expr>) {
    return new Select<T>({
      ...this.#data,
      groupBy: sql.join(exprs, sql.unsafe(', '))
    })
  }

  having(having: Expr<boolean>) {
    return new Select<T>({...this.#data, having})
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

  get [meta.selection]() {
    const {selection} = this.#data
    if (!selection) throw new Error('todo')
    return new Selection(selection)
  }

  get [meta.query]() {
    const parts: Array<Sql> = []
    const {selection, distinct, from, where, groupBy, having, orderBy, limit} =
      this.#data
    const select = !selection
      ? from && hasTable(from)
        ? getTable(from).listColumns()
        : sql`*`
      : getSelection(this).toSql({includeTableName: true})
    parts.push(sql`select ${select}`)
    if (from) {
      const target = hasTable(from)
        ? sql.identifier(getTable(from).name)
        : sql`(${getQuery(from)})`
      parts.push(sql`from ${target}`)
    }
    if (where) parts.push(sql`where ${where}`)
    if (groupBy) parts.push(sql`group by ${groupBy}`)
    if (having) parts.push(sql`having ${having}`)
    if (orderBy) parts.push(sql`order by ${orderBy}`)
    if (limit) parts.push(sql`limit ${limit}`)
    return sql.join(parts)
  }
}
