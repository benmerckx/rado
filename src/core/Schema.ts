import {
  type Table,
  type TableConfigResult,
  type TableDefinition,
  table
} from './Table.ts'
import {type DefinedView, type QueryView, view} from './View.ts'

type Prefix<
  SchemaName extends string,
  TableName extends string
> = `${SchemaName}.${TableName}`

export interface Schema<SchemaName extends string> {
  table<Definition extends TableDefinition, TableName extends string>(
    tableName: TableName,
    columns: Definition,
    config?: (self: Table<Definition, TableName>) => TableConfigResult
  ): Table<Definition, TableName>
  view(viewName: string): QueryView
  view<Definition extends TableDefinition>(
    viewName: string,
    columns: Definition
  ): DefinedView<Definition>
}

export function schema<SchemaName extends string>(
  schemaName: SchemaName
): Schema<SchemaName> {
  return <Schema<SchemaName>>{
    table(tableName, columns, config) {
      return table(tableName, columns, config, schemaName)
    },
    view(viewName: string, columns?: TableDefinition) {
      return columns
        ? view(viewName, columns, schemaName)
        : view(viewName, undefined, schemaName)
    }
  }
}
