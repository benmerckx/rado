import {
  type ColumnsOf,
  type RelationsOf,
  type Table,
  type TableConfig,
  type TableDefinition,
  type TableDefinitionInput,
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
    config?: (self: Table<Definition>) => TableConfig<TableName>
  ): Table<Definition, TableName>
  table<Definition extends TableDefinitionInput, TableName extends string>(
    tableName: TableName,
    columns: Definition,
    config?: (self: Table<ColumnsOf<Definition>>) => TableConfig<TableName>
  ): Table<ColumnsOf<Definition>, TableName> & RelationsOf<Definition>
}

export function schema<SchemaName extends string>(
  schemaName: SchemaName
): Schema<SchemaName> {
  return <Schema<SchemaName>>{
    table(tableName: any, columns: any, config: any) {
      return table(tableName, columns, config, schemaName)
    }
  }
}
