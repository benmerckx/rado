import {input, type Expr} from '../Expr.ts'
import {
  getData,
  getExpr,
  getTable,
  hasExpr,
  internal,
  type HasExpr,
  type HasTable
} from '../Internal.ts'
import {Query, QueryData, type QueryMode} from '../Query.ts'
import {
  Selection,
  type SelectionInput,
  type SelectionRow
} from '../Selection.ts'
import {sql, type Sql} from '../Sql.ts'
import type {Table, TableDefinition, TableUpdate} from '../Table.ts'

const {fromEntries, entries} = Object

class UpdateData<Mode extends QueryMode = QueryMode> extends QueryData<Mode> {
  table!: HasTable
  values?: Record<string, Sql>
  where?: HasExpr
  returning?: Sql
}

export class Update<Result, Mode extends QueryMode> extends Query<
  Result,
  Mode
> {
  readonly [internal.data]: UpdateData<Mode>

  constructor(data: UpdateData<Mode>) {
    super(data)
    this[internal.data] = data
  }

  get [internal.query]() {
    const {values, where, returning} = getData(this)
    const table = getTable(getData(this).table)
    if (!values) throw new Error('No values to update')
    return sql
      .join([
        sql`update`,
        sql.identifier(table.name),
        sql`set`,
        sql.join(
          entries(values).map(
            ([key, value]) => sql`${sql.identifier(key)} = ${value}`
          ),
          sql`, `
        ),
        where ? sql`where ${getExpr(where)}` : undefined,
        returning && sql`returning ${returning}`
      ])
      .inlineFields(false)
  }
}

export class UpdateTable<
  Definition extends TableDefinition,
  Mode extends QueryMode
> extends Update<void, Mode> {
  set(values: TableUpdate<Definition>): Update<Definition, Mode> {
    const update = fromEntries(
      entries(values).map(([key, value]) => {
        const expr = input(value)
        const sql = hasExpr(expr) ? getExpr(expr) : expr
        return [key, sql]
      })
    )
    return new Update({...getData(this), values: update})
  }

  where(condition: Expr<boolean>): Update<Definition, Mode> {
    return new Update({...getData(this), where: condition})
  }

  returning<Input extends SelectionInput>(
    selection: Input
  ): Update<SelectionRow<Input>, Mode> {
    return new Update({
      ...getData(this),
      returning: new Selection(selection).toSql()
    })
  }
}

export function update<Definition extends TableDefinition>(
  table: Table<Definition>
): UpdateTable<Definition, undefined> {
  return new UpdateTable({table})
}
