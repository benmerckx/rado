import {table, type Table, type TableDefinition} from './Table.ts'

export function schema<SchemaName extends string>(schemaName: SchemaName) {
  return {
    table<Definition extends TableDefinition, TableName extends string>(
      tableName: TableName,
      columns: Definition
    ) {
      return <Table<Definition, `${SchemaName}.${TableName}`>>(
        table(tableName, columns, schemaName)
      )
    }
  }
}
