import {
  table,
  type Table,
  type TableConfig,
  type TableDefinition
} from './Table.ts'

export function schema<SchemaName extends string>(schemaName: SchemaName) {
  type Prefix<TableName extends string> = `${SchemaName}.${TableName}`
  return {
    table<Definition extends TableDefinition, TableName extends string>(
      tableName: TableName,
      columns: Definition,
      config?: (self: Table<Definition>) => TableConfig<Prefix<TableName>>
    ) {
      return <Table<Definition, Prefix<TableName>>>(
        table(tableName, columns, config, schemaName)
      )
    }
  }
}
