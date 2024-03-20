import {input, type Expr} from '../Expr.ts'
import {
  getExpr,
  getTable,
  hasExpr,
  meta,
  type HasExpr,
  type HasTable
} from '../Meta.ts'
import {Query, QueryData, type QueryMode} from '../Query.ts'
import {sql, type Sql} from '../Sql.ts'
import type {Table, TableDefinition, TableUpdate} from '../Table.ts'

const {fromEntries, entries} = Object

class UpdateData<Mode extends QueryMode> extends QueryData<Mode> {
  table!: HasTable
  values?: Record<string, Sql>
  where?: HasExpr
}

export class Update<
  Definition extends TableDefinition,
  Mode extends QueryMode
> extends Query<void, Mode> {
  #data: UpdateData<Mode>

  constructor(data: UpdateData<Mode>) {
    super(data)
    this.#data = data
  }

  set(values: TableUpdate<Definition>): Update<Definition, Mode> {
    const update = fromEntries(
      entries(values).map(([key, value]) => {
        const expr = input(value)
        const sql = hasExpr(expr) ? getExpr(expr) : expr
        return [key, sql]
      })
    )
    return new Update({...this.#data, values: update})
  }

  where(condition: Expr<boolean>): Update<Definition, Mode> {
    return new Update({...this.#data, where: condition})
  }

  get [meta.query]() {
    const {values, where} = this.#data
    const table = getTable(this.#data.table)
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
        where ? sql`where ${getExpr(where)}` : undefined
      ])
      .inlineFields(false)
  }
}

export function update<Definition extends TableDefinition>(
  table: Table<Definition>
): Update<Definition, undefined> {
  return new Update({table})
}
