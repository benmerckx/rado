import {
  type Table,
  type TableConfig,
  type TableDefinition,
  table
} from './Table.ts'

type Prefix<
  SchemaName extends string,
  TableName extends string
> = `${SchemaName}.${TableName}`
export interface Schema<SchemaName extends string> {
  table<Definition extends TableDefinition, TableName extends string>(
    tableName: TableName,
    columns: Definition,
    config?: (
      self: Table<Definition>
    ) => TableConfig<Prefix<SchemaName, TableName>>
  ): Table<Definition, Prefix<SchemaName, TableName>>
}

export function schema<SchemaName extends string>(
  schemaName: SchemaName
): Schema<SchemaName> {
  return <Schema<SchemaName>>{
    table(tableName, columns, config) {
      return table(tableName, columns, config, schemaName)
    }
  }
}
