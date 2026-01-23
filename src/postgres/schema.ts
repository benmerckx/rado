import type {IsPostgres} from '../core/MetaData.ts'
import type {Table, TableConfig, TableDefinition} from '../core/Table.ts'
import {table} from '../core/Table.ts'
import {type DefinedView, type QueryView, view} from '../core/View.ts'
import {type PgEnum, pgEnum} from './enum.ts'

type Prefix<
  SchemaName extends string,
  TableName extends string
> = `${SchemaName}.${TableName}`

export interface PgSchema<SchemaName extends string> {
  table<Definition extends TableDefinition, TableName extends string>(
    tableName: TableName,
    columns: Definition,
    config?: (
      self: Table<Definition>
    ) => TableConfig<Prefix<SchemaName, TableName>>
  ): Table<Definition, Prefix<SchemaName, TableName>>
  enum<
    const Name extends string,
    const Values extends readonly [string, ...string[]]
  >(name: Name, values: Values): PgEnum<Values>
  view(name: string): QueryView<IsPostgres>
  view<Definition extends TableDefinition>(
    name: string,
    fields: Definition
  ): DefinedView<Definition, IsPostgres>
}

export function pgSchema<SchemaName extends string>(
  schemaName: SchemaName
): PgSchema<SchemaName> {
  return <PgSchema<SchemaName>>{
    table(tableName, columns, config) {
      return table(tableName, columns, config, schemaName)
    },
    enum(name, values) {
      return pgEnum(name, values, schemaName)
    },
    view(name, fields) {
      return view(name, fields, schemaName)
    }
  }
}
