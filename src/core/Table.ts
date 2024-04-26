import type {Column, JsonColumn, RequiredColumn} from './Column.ts'
import {jsonExpr, type Input, type JsonExpr} from './Expr.ts'
import {Field} from './Field.ts'
import {
  getColumn,
  getTable,
  internalTable,
  internalTarget,
  type HasSql,
  type HasTable,
  type HasTarget
} from './Internal.ts'
import {sql, type Sql} from './Sql.ts'

const {assign, fromEntries, entries} = Object

export type TableDefinition = {
  [name: string]: Column
}

class TableData {
  name!: string
  alias?: string
  schemaName?: string
  columns!: TableDefinition
}

export class TableApi<
  Definition extends TableDefinition = TableDefinition,
  Name extends string = string
> extends TableData {
  private declare brand?: [Definition, Name]

  get aliased() {
    return this.alias ?? this.name
  }

  target(): Sql {
    const name = sql.join(
      [
        this.schemaName ? sql.identifier(this.schemaName) : undefined,
        sql.identifier(this.name)
      ],
      sql`.`
    )
    return sql.join([
      name,
      this.alias ? sql`as ${sql.identifier(this.alias)}` : undefined
    ])
  }

  createColumns(): Sql {
    return sql.join(
      entries(this.columns).map(([name, isColumn]) => {
        const column = getColumn(isColumn)
        const columnName = sql.identifier(column.name ?? name)
        return sql`${columnName} ${sql.chunk('emitColumn', column)}`
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

  fields(): Record<string, HasSql> {
    return fromEntries(
      entries(this.columns).map(([name, column]) => {
        const columnApi = getColumn(column)
        const {name: givenName} = columnApi
        const field = new Field(this.aliased, givenName ?? name, columnApi)
        if (columnApi.json) return [name, jsonExpr(field)]
        return [name, field]
      })
    )
  }
}

export type Table<
  Definition extends TableDefinition = TableDefinition,
  Name extends string = string
> = TableFields<Definition, Name> & HasTable<Definition, Name> & HasTarget

export type TableFields<
  Definition extends TableDefinition,
  TableName extends string = string
> = {
  [K in keyof Definition]: Definition[K] extends JsonColumn<infer T>
    ? JsonExpr<T>
    : Definition[K] extends Column<infer T>
      ? Field<T, TableName>
      : never
}

export type TableRow<Definition extends TableDefinition> = {
  [K in keyof Definition]: Definition[K] extends Column<infer T> ? T : never
} & {}

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
  columns: Definition,
  schemaName?: string
) {
  const api = assign(new TableApi(), {name, schemaName, columns})
  return <Table<Definition, Name>>{
    [internalTable]: api,
    [internalTarget]: api.target(),
    ...api.fields()
  }
}

export function alias<Definition extends TableDefinition, Alias extends string>(
  table: Table<Definition>,
  alias: Alias
) {
  const api = assign(new TableApi(), {...getTable(table), alias})
  return <Table<Definition, Alias>>{
    [internalTable]: api,
    [internalTarget]: api.target(),
    ...api.fields()
  }
}
