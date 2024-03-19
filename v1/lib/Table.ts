import type {Column, RequiredColumn} from './Column.ts'
import {Expr, type Input} from './Expr.ts'
import {getColumn, meta, type HasField, type HasTable} from './Meta.ts'
import {sql, type Sql} from './Sql.ts'

const {assign, fromEntries, entries} = Object

export type TableDefinition = Record<string, Column>

class TableData {
  name!: string
  columns!: TableDefinition
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

  selectColumns(): Sql {
    return sql.join(
      entries(this.columns).map(([name, column]) => {
        const {name: givenName} = getColumn(column)
        const api = new FieldApi(this.name, givenName ?? name)
        return sql.field(api)
      }),
      sql`, `
    )
  }

  listColumns(): Sql {
    return sql.join(
      entries(this.columns).map(([name, column]) => {
        const {name: givenName} = getColumn(column)
        return sql.identifier(givenName ?? name)
      }),
      sql`, `
    )
  }

  fields() {
    return fromEntries(
      entries(this.columns).map(([name, column]) => {
        const {name: givenName} = getColumn(column)
        const field = new Field(this.name, givenName ?? name)
        return [name, field]
      })
    )
  }
}

export class FieldApi {
  constructor(public tableName: string, public fieldName: string) {}

  toSql(): Sql {
    return sql`${sql.identifier(this.tableName)}.${sql.identifier(
      this.fieldName
    )}`
  }
}

class Field extends Expr implements HasField {
  readonly [meta.field]: FieldApi
  constructor(tableName: string, fieldName: string) {
    const api = new FieldApi(tableName, fieldName)
    super(sql.field(api))
    this[meta.field] = api
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

export type TableUpdate<Definition extends TableDefinition> = {
  [K in keyof Definition]?: Definition[K] extends Column<infer T>
    ? Input<T>
    : never
}

export function table<Definition extends TableDefinition>(
  name: string,
  columns: Definition
) {
  const api = assign(new TableApi(), {name, columns})
  return <Table<Definition>>{
    [meta.table]: api,
    ...api.fields()
  }
}
