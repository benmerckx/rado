import {
  type Column,
  type JsonColumn,
  type RequiredColumn,
  formatColumn
} from './Column.ts'
import type {
  ForeignKeyConstraint,
  PrimaryKeyConstraint,
  UniqueConstraint
} from './Constraint.ts'
import {Index} from './Index.ts'
import {
  type HasConstraint,
  type HasData,
  type HasSelection,
  type HasSql,
  type HasTable,
  getConstraint,
  getData,
  getTable,
  hasConstraint,
  internalSelection,
  internalTable,
  internalTarget
} from './Internal.ts'
import {selection} from './Selection.ts'
import {type Sql, sql} from './Sql.ts'
import {Field} from './expr/Field.ts'
import type {Input} from './expr/Input.ts'
import {type JsonExpr, jsonExpr} from './expr/Json.ts'

const {assign, fromEntries, entries, keys} = Object

export type TableDefinition = {
  [name: string]: Column
}

class TableData {
  name!: string
  alias?: string
  schemaName?: string
  columns!: TableDefinition
  config?: TableConfig
}

export class TableApi<
  Definition extends TableDefinition = TableDefinition,
  Name extends string = string
> extends TableData {
  private declare brand: [Definition, Name]

  get aliased(): string {
    return this.alias ?? this.name
  }

  identifier(altName?: string): Sql {
    return sql.join(
      [
        this.schemaName ? sql.identifier(this.schemaName) : undefined,
        sql.identifier(altName ?? this.name)
      ],
      sql`.`
    )
  }

  target(): Sql {
    return sql.join([
      this.identifier(),
      this.alias ? sql`as ${sql.identifier(this.alias)}` : undefined
    ])
  }

  columnDefinition(name: string): Sql {
    const columnData = this.columns[name]
    const column = getData(columnData)
    const columnName = sql.identifier(column.name ?? name)
    return sql`${columnName} ${formatColumn(column)}`
  }

  createDefinition(): Sql {
    const createColumns = keys(this.columns).map(name =>
      this.columnDefinition(name)
    )
    const createConstraints = entries(this.config ?? {})
      .filter(([, constraint]) => hasConstraint(constraint))
      .map(([key, constraint]) => {
        const {name} = getData(constraint as HasData<{name?: string}>)
        return sql`constraint ${sql.identifier(name ?? key)} ${getConstraint(
          constraint as HasConstraint
        )}`
      })
    return sql.join(createColumns.concat(createConstraints), sql`, `)
  }

  listColumns(): Sql {
    return sql.join(
      entries(this.columns).map(([name, column]) => {
        const columnApi = getData(column)
        const {name: givenName} = columnApi
        return sql.identifier(givenName ?? name)
      }),
      sql`, `
    )
  }

  fields(): Record<string, HasSql> {
    return fromEntries(
      entries(this.columns).map(([name, column]) => {
        const columnApi = getData(column)
        const {name: givenName} = columnApi
        const field = new Field(this.aliased, givenName ?? name, columnApi)
        if (columnApi.json) return [name, jsonExpr(field)]
        return [name, field]
      })
    )
  }

  createTable(altName?: string, ifNotExists = false): Sql {
    return sql.join([
      sql`create table`,
      ifNotExists ? sql`if not exists` : undefined,
      this.identifier(altName),
      sql`(${this.createDefinition()})`
    ])
  }

  createIndexes(): Array<Sql> {
    return entries(this.indexes()).map(([name, index]) => {
      const indexApi = getData(index)
      return indexApi.toSql(this.name, name, false)
    })
  }

  create(): Array<Sql> {
    return [this.createTable(), ...this.createIndexes()]
  }

  drop(): Sql {
    return sql`drop table if exists ${this.target()}`
  }

  indexes(): Record<string, Index> {
    return fromEntries(
      entries(this.config ?? {}).filter(([, config]) => config instanceof Index)
    ) as Record<string, Index>
  }
}

export type Table<
  Definition extends TableDefinition = Record<never, Column>,
  Name extends string = string
> = TableFields<Definition, Name> & HasTable<Definition, Name> & HasSelection

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

type IsReq<Col> = Col extends RequiredColumn<infer Value>
  ? null extends Value
    ? true
    : false
  : false
type RequiredInput<D> = {
  readonly [K in keyof D as true extends IsReq<D[K]>
    ? K
    : never]: D[K] extends Column<infer V> ? Input<V> : never
}
type OptionalInput<D> = {
  readonly [K in keyof D as false extends IsReq<D[K]>
    ? K
    : never]?: D[K] extends Column<infer V> ? Input<V> : never
}

export type TableInsert<Definition extends TableDefinition> =
  RequiredInput<Definition> & OptionalInput<Definition>

export type TableUpdate<Definition extends TableDefinition> = {
  readonly [K in keyof Definition]?: Definition[K] extends Column<infer T>
    ? Input<T>
    : never
}

export type TableConfigSetting<Name extends string> =
  | UniqueConstraint<Name>
  | PrimaryKeyConstraint<Name>
  | ForeignKeyConstraint<Name>
  | Index<Name>

export interface TableConfig<Name extends string = string>
  extends Record<string, TableConfigSetting<Name>> {}

export function table<Definition extends TableDefinition, Name extends string>(
  name: Name,
  columns: Definition,
  config?: (self: Table<Definition, Name>) => TableConfig<Name>,
  schemaName?: string
): Table<Definition, Name> {
  const api = assign(new TableApi<Definition, Name>(), {
    name,
    schemaName,
    columns
  })
  const fields = api.fields()
  const table = <Table<Definition, Name>>{
    [internalTable]: api,
    [internalTarget]: api.target(),
    [internalSelection]: selection(fields),
    ...fields
  }
  if (config) api.config = config(table)
  return table
}

export function alias<Definition extends TableDefinition, Alias extends string>(
  table: Table<Definition>,
  alias: Alias
): Table<Definition, Alias> {
  const api = assign(new TableApi<Definition, Alias>(), {
    ...getTable(table),
    alias
  })
  const fields = api.fields()
  return <Table<Definition, Alias>>{
    [internalTable]: api,
    [internalTarget]: api.target(),
    [internalSelection]: selection(fields),
    ...api.fields()
  }
}

export function tableCreator(
  nameTable: (name: string) => string
): typeof table {
  return (name, columns, config, schemaName) => {
    return table(<any>nameTable(name), columns, config, schemaName)
  }
}
