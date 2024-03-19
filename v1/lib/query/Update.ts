import {input, type Expr} from '../Expr.ts'
import {
  getExpr,
  getTable,
  hasExpr,
  meta,
  type HasExpr,
  type HasQuery,
  type HasTable
} from '../Meta.ts'
import {sql, type Sql} from '../Sql.ts'
import type {TableDefinition, TableUpdate} from '../Table.ts'

const {fromEntries, entries} = Object

class UpdateData {
  table!: HasTable
  values?: Record<string, Sql>
  where?: HasExpr
}

export class Update<Definition extends TableDefinition> implements HasQuery {
  #data: UpdateData

  constructor(data: UpdateData) {
    this.#data = data
  }

  set(values: TableUpdate<Definition>) {
    const update = fromEntries(
      entries(values).map(([key, value]) => {
        const expr = input(value)
        const sql = hasExpr(expr) ? getExpr(expr) : expr
        return [key, sql]
      })
    )
    return new Update({...this.#data, values: update})
  }

  where(condition: Expr<boolean>) {
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
