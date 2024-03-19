import type {Expr} from '../Expr.ts'
import {
  getQuery,
  getSelection,
  getTable,
  hasTable,
  meta,
  type HasExpr,
  type HasQuery,
  type HasSelection,
  type HasTable
} from '../Meta.ts'
import {Selection, type SelectionInput} from '../Selection.ts'
import {sql, type Sql} from '../Sql.ts'
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
    const {selection, distinct, from, where, groupBy, having, orderBy, limit} =
      this.#data
    const select = !selection
      ? from && hasTable(from)
        ? getTable(from).selectColumns()
        : sql`*`
      : getSelection(this).toSql()
    const target = from
      ? sql`from ${
          hasTable(from)
            ? sql.identifier(getTable(from).name)
            : sql`(${getQuery(from).inlineFields(true)})`
        }`
      : undefined
    return sql.join([
      distinct ? sql`select distinct` : sql`select`,
      select,
      target,
      where && sql`where ${where}`,
      groupBy && sql`group by ${groupBy}`,
      having && sql`having ${having}`,
      orderBy && sql`order by ${orderBy}`,
      limit && sql`limit ${limit}`
    ])
  }
}
