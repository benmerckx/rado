import {RequiredColumn, type Column} from './Column.ts'
import {ExprApi, Input, expr, type Expr} from './Expr.ts'
import {HasExpr, HasTable, getColumn, meta} from './Meta.ts'
import {Sql, sql} from './Sql.ts'

const {assign, fromEntries, entries} = Object

export type TableDefinition = Record<string, Column>

class TableData {
  name!: string
  columns!: TableDefinition
}

class Field implements HasExpr {
  readonly [meta.expr]: ExprApi
  constructor(private tableName: string, private fieldName: string) {
    this[meta.expr] = this.toSql.bind(this)
  }

  toSql(options: {includeTableName: boolean}): Sql {
    return options.includeTableName
      ? sql`${sql.identifier(this.tableName)}.${sql.identifier(this.fieldName)}`
      : sql.identifier(this.fieldName)
  }
}

export class TableApi extends TableData {
  createColumns(): Sql {
    return sql.join(
      entries(this.columns).map(([name, isColumn]) => {
        const column = getColumn(isColumn)
        const columnName = sql.identifier(column.name ?? name)
        return sql`${columnName} ${column.sqlType()}`
      }),
      sql`, `
    )
  }

  listColumns(): Sql {
    return sql.join(
      entries(this.columns).map(([name, isColumn]) => {
        const column = getColumn(isColumn)
        const columnName = sql.identifier(column.name ?? name)
        return sql`${columnName}`
      }),
      sql`, `
    )
  }

  fields() {
    return fromEntries(
      entries(this.columns).map(([name, column]) => {
        const {name: givenName} = getColumn(column)
        const field = expr(new Field(this.name, givenName ?? name))
        return [name, field]
      })
    )
  }
}

export type Table<Definition extends TableDefinition = TableDefinition> =
  HasTable & TableRow<Definition>

export type TableRow<Definition extends TableDefinition> = {
  [K in keyof Definition]: Definition[K] extends Column<infer T>
    ? Expr<T>
    : never
}

type IsReq<Col> = Col extends RequiredColumn ? true : false
type Required<D> = {
  [K in keyof D as true extends IsReq<D[K]> ? K : never]: D[K]
}
type Optional<D> = {
  [K in keyof D as false extends IsReq<D[K]> ? K : never]: D[K]
}
type RequiredInput<D> = {
  [K in keyof Required<D>]: D[K] extends Column<infer V> ? Input<V> : never
}
type OptionalInput<D> = {
  [K in keyof Optional<D>]?: D[K] extends Column<infer V> ? Input<V> : never
}
export type TableInsert<Definition extends TableDefinition> =
  RequiredInput<Definition> & OptionalInput<Definition>

export function table<Definition extends TableDefinition>(
  name: string,
  columns: Definition
) {
  const api = assign(new TableApi(), {name, columns})
  return <Table<Definition>>{
    [meta.table]: assign(new TableApi(), {name, columns}),
    ...api.fields()
  }
}
