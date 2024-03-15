import type {Column} from './Column.ts'
import {expr, type Expr} from './Expr.ts'
import {Is, getColumn, type IsSql, type IsTable} from './Is.ts'
import {sql} from './Sql.ts'

const {assign, fromEntries, entries} = Object

type TableDefinition = Record<string, Column>

class TableData {
  name!: string
  columns!: TableDefinition
}

export class TableApi extends TableData {
  createColumns(): IsSql {
    return sql.join(
      entries(this.columns).map(([name, isColumn]) => {
        const column = getColumn(isColumn)
        const columnName = sql.identifier(column.name ?? name)
        return sql`${columnName} ${column.sqlType()}`
      }),
      sql`, `
    )
  }

  selectColumns(): IsSql {
    return sql.join(
      entries(this.columns).map(([name, isColumn]) => {
        const column = getColumn(isColumn)
        const columnName = sql.identifier(column.name ?? name)
        return sql`${columnName}`
      }),
      sql`, `
    )
  }
}

export type Table<Row> = IsTable & Row

export function table<Definition extends TableDefinition>(
  name: string,
  columns: Definition
) {
  const tableName = sql.identifier(name)
  const exprs = fromEntries(
    entries(columns).map(([name, column]) => {
      const {name: givenName} = column[Is.column]
      const columnName = sql.identifier(givenName ?? name)
      const field = expr(sql`${tableName}.${columnName}`)
      return [name, field]
    })
  )
  return {
    [Is.table]: assign(new TableApi(), {name, columns}),
    ...exprs
  } as Table<{
    [K in keyof Definition]: Definition[K] extends Column<infer T>
      ? Expr<T>
      : never
  }>
}
