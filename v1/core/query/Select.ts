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
import {Query, QueryData, QueryMode} from '../Query.ts'
import {Selection, type SelectionInput} from '../Selection.ts'
import {sql, type Sql} from '../Sql.ts'
import type {Table, TableDefinition, TableRow} from '../Table.ts'
import {Union} from './Union.ts'

class SelectData extends QueryData {
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

export class Select<Result, Mode extends QueryMode>
  extends Query<Result, Mode>
  implements HasSelection
{
  #data: SelectData
  constructor(data: SelectData) {
    super(data)
    this.#data = data
  }

  select<T>(selection: SelectionInput): Select<T, Mode> {
    return new Select<T, Mode>({...this.#data, selection})
  }

  from<Definition extends TableDefinition>(
    from: Table<Definition>
  ): Select<TableRow<Definition>, Mode>
  from(from: HasQuery): Select<unknown, Mode>
  from(from: HasQuery | Table) {
    return new Select({...this.#data, from})
  }

  selectDistinct(selection: SelectionInput): Select<Result, Mode> {
    return new Select<Result, Mode>({...this.#data, selection})
  }

  where(where: Expr<boolean>) {
    return new Select<Result, Mode>({...this.#data, where})
  }

  groupBy(...exprs: Array<Expr>) {
    return new Select<Result, Mode>({
      ...this.#data,
      groupBy: sql.join(exprs, sql.unsafe(', '))
    })
  }

  having(having: Expr<boolean>) {
    return new Select<Result, Mode>({...this.#data, having})
  }

  orderBy(...exprs: Array<Expr>) {
    return new Select<Result, Mode>({
      ...this.#data,
      orderBy: sql.join(exprs, sql.unsafe(', '))
    })
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
