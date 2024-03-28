import type {Column, RequiredColumn} from './Column.ts'
import type {Input} from './Expr.ts'
import {Field} from './Field.ts'
import {type HasTable, getColumn, getTable, internal} from './Internal.ts'
import {type Sql, sql} from './Sql.ts'

const {assign, fromEntries, entries} = Object

export type TableDefinition = {
  [name: string]: Column
}

class TableData {
  source = Symbol()
  name!: string
  alias?: string
  columns!: TableDefinition
}

export class TableApi<
  Definition extends TableDefinition = TableDefinition,
  Name extends string = string
> extends TableData {
  #definition?: Definition
  #name?: Name

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
      entries(this.columns).map(([name, column]) => {
        const columnApi = getColumn(column)
        const {name: givenName} = columnApi
        return sql.identifier(givenName ?? name)
      }),
      sql`, `
    )
  }

  fields() {
    return fromEntries(
      entries(this.columns).map(([name, column]) => {
        const columnApi = getColumn(column)
        const {name: givenName} = columnApi
        const field = new Field(
          columnApi,
          this.alias ?? this.name,
          givenName ?? name
        )
        return [name, field]
      })
    )
  }
}

export type Table<
  Definition extends TableDefinition = TableDefinition,
  Name extends string = string
> = HasTable<Definition, Name> & TableRow<Definition, Name>

export type TableRow<
  Definition extends TableDefinition,
  TableName extends string = string
> = {
  readonly [K in keyof Definition]: Definition[K] extends Column<infer T>
    ? Field<T, TableName>
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
  readonly [K in keyof Required<D>]: D[K] extends Column<infer V>
    ? Input<V>
    : never
}
type OptionalInput<D> = {
  readonly [K in keyof Optional<D>]?: D[K] extends Column<infer V>
    ? Input<V>
    : never
}
export type TableInsert<Definition extends TableDefinition> =
  RequiredInput<Definition> & OptionalInput<Definition>

export type TableUpdate<Definition extends TableDefinition> = {
  readonly [K in keyof Definition]?: Definition[K] extends Column<infer T>
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
