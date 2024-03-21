import type {Column, RequiredColumn} from './Column.ts'
import {Expr, type Input} from './Expr.ts'
import {
  type HasField,
  type HasTable,
  getColumn,
  getTable,
  internal
} from './Internal.ts'
import {type Sql, sql} from './Sql.ts'

const {assign, fromEntries, entries} = Object

export type TableDefinition = {
  [name: string]: Column
}

class TableData {
  name!: string
  alias?: string
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
        const api = new FieldApi(this.alias ?? this.name, givenName ?? name)
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
        const field = new Field(this.alias ?? this.name, givenName ?? name)
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
  readonly [internal.field]: FieldApi
  constructor(tableName: string, fieldName: string) {
    const api = new FieldApi(tableName, fieldName)
    super(sql.field(api))
    this[internal.field] = api
  }
}

declare class Named<Name extends string> {
  #name?: Name
}
export type Table<
  Definition extends TableDefinition = TableDefinition,
  Name extends string = string
> = HasTable & TableRow<Definition> & Named<Name>

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

export function table<Definition extends TableDefinition, Name extends string>(
  name: Name,
  columns: Definition
) {
  const api = assign(new TableApi(), {name, columns})
  return <Table<Definition, Name>>{[internal.table]: api, ...api.fields()}
}

export function alias<Definition extends TableDefinition, Alias extends string>(
  table: Table<Definition>,
  alias: Alias
) {
  const api = assign(new TableApi(), {...getTable(table), alias})
  return <Table<Definition, Alias>>{[internal.table]: api, ...api.fields()}
}
